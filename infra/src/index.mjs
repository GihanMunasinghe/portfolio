/* Blog platform backend — single Lambda behind a Function URL.
 *
 * Routes (JSON):
 *   POST   /login              {password} -> {token}
 *   GET    /posts              public list (published, no html) | ?all=1 with auth includes drafts
 *   GET    /post?slug=x        full post (drafts require auth)
 *   POST   /posts              create/replace post (auth, or x-agent-key for the daily agent -> always draft)
 *   PUT    /post?slug=x        {action: publish|unpublish|toggleComments|update, fields?} (auth)
 *   DELETE /post?slug=x        delete post + its comments (auth)
 *   GET    /comments?slug=x    public comment list
 *   POST   /comments           {slug,name,text,parentId?,website?} public; admin JWT marks isOwner
 *   DELETE /comment?slug=x&id= (auth)
 *   POST   /like               {slug} -> {likes}
 *   POST   /track              {path,ref} pageview beacon
 *   GET    /stats              (auth) 30-day totals, per-path counts
 *
 * Scheduled EventBridge invocations ({job:"daily-draft"}) research + write a
 * draft post via the Anthropic API and email a morning summary via SES.
 */
import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand,
  QueryCommand, UpdateCommand, BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ses = new SESv2Client({});
const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});

const TABLE = process.env.TABLE_NAME;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH; // sha256 hex of the admin password
const AGENT_KEY = process.env.AGENT_KEY;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SITE = process.env.SITE_URL || "https://www.gihanmunasinghe.lk";
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;          // S3 bucket for product photos
const MEDIA_BASE = process.env.MEDIA_BASE;              // public base URL for the media bucket
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;    // sk_live_… / sk_test_…
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/* ---------- tiny JWT (HS256) ---------- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function jwtSign(payload, days = 30) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 };
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}
function jwtVerify(token) {
  try {
    const [h, p, sig] = token.split(".");
    const expect = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const body = JSON.parse(Buffer.from(p, "base64url").toString());
    if (body.exp < Date.now() / 1000) return null;
    return body;
  } catch { return null; }
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ---------- helpers ---------- */
const res = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const clean = (s, max) => String(s ?? "").replace(/<[^>]*>/g, "").trim().slice(0, max);
const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtMoney = (m, c) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: (c || "USD") }).format((m || 0) / 100); } catch { return `${c || "USD"} ${((m || 0) / 100).toFixed(2)}`; } };
const isAdmin = (event) => {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const m = auth.match(/^Bearer (.+)$/);
  return m ? jwtVerify(m[1]) : null;
};
const isAgent = (event) =>
  AGENT_KEY && (event.headers?.["x-agent-key"] === AGENT_KEY);

const postKey = (slug) => ({ pk: `POST#${slug}`, sk: "META" });
const publicPost = ({ pk, sk, gsi1pk, ...p }, withHtml) =>
  withHtml ? p : (({ html, ...rest }) => rest)(p);

/* ---------- posts ---------- */
async function listPosts(all) {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :p",
    ExpressionAttributeValues: { ":p": "POSTS" },
    ScanIndexForward: false,
  }));
  const items = (out.Items || []).map((i) => publicPost(i, false));
  return all ? items : items.filter((p) => p.status === "published");
}
async function getPost(slug) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: postKey(slug) }));
  return out.Item || null;
}
async function savePost(input, { asDraft }) {
  const slug = clean(input.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || !input.title || !input.html) throw new Error("slug, title and html are required");
  const existing = await getPost(slug);
  const now = new Date();
  const item = {
    ...postKey(slug),
    gsi1pk: "POSTS",
    slug,
    title: clean(input.title, 200),
    excerpt: clean(input.excerpt, 500),
    date: clean(input.date, 40) || now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    readTime: clean(input.readTime, 30) || "6 min read",
    media: clean(input.media, 30),
    image: typeof input.image === "string" ? input.image.slice(0, 300) : existing?.image,
    coverSvg: typeof input.coverSvg === "string" ? input.coverSvg.slice(0, 20000) : (existing?.coverSvg),
    html: String(input.html).slice(0, 250000),
    sources: Array.isArray(input.sources) ? input.sources.slice(0, 10).map((s) => clean(s, 300)) : existing?.sources,
    status: asDraft ? "draft" : (input.status === "published" ? "published" : existing?.status || "draft"),
    commentsEnabled: existing ? existing.commentsEnabled !== false : true,
    likes: existing?.likes || 0,
    createdAt: existing?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/* ---------- daily draft agent (AWS Bedrock) ---------- */
async function bedrockText(system, userText, maxTokens = 4096) {
  const out = await bedrock.send(new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: system }],
    messages: [{ role: "user", content: [{ text: userText }] }],
    inferenceConfig: { maxTokens, temperature: 0.7 },
  }));
  return (out.output.message.content || []).map((c) => c.text || "").join("");
}

function coverSvg(title, badge) {
  const words = title.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 24) { lines.push(line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.4">
<stop offset="0" stop-color="#6ea8fe"/><stop offset="0.55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
<radialGradient id="r1" cx="0.9" cy="0.05" r="0.7"><stop offset="0" stop-color="rgba(139,92,246,0.35)"/><stop offset="1" stop-color="rgba(139,92,246,0)"/></radialGradient>
<radialGradient id="r2" cx="0.05" cy="1" r="0.7"><stop offset="0" stop-color="rgba(34,211,238,0.25)"/><stop offset="1" stop-color="rgba(34,211,238,0)"/></radialGradient></defs>
<rect width="1200" height="675" fill="#07090d"/><rect width="1200" height="675" fill="url(#r1)"/><rect width="1200" height="675" fill="url(#r2)"/>
<g stroke="rgba(110,168,254,0.22)" stroke-width="1.5" fill="rgba(139,92,246,0.7)">
<line x1="880" y1="120" x2="1030" y2="210"/><line x1="1030" y1="210" x2="950" y2="360"/><line x1="950" y1="360" x2="1100" y2="440"/><line x1="1030" y1="210" x2="1140" y2="140"/>
<circle cx="880" cy="120" r="7"/><circle cx="1030" cy="210" r="9"/><circle cx="950" cy="360" r="8"/><circle cx="1100" cy="440" r="7"/><circle cx="1140" cy="140" r="6"/></g>
<text x="90" y="150" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4" fill="url(#g)">${esc((badge || "ENGINEERING").toUpperCase())}</text>
${lines.slice(0, 4).map((l, i) => `<text x="88" y="${250 + i * 84}" font-family="Arial, sans-serif" font-size="68" font-weight="800" fill="#eef1f7">${esc(l)}</text>`).join("")}
<text x="90" y="${300 + Math.min(lines.length, 4) * 84}" font-family="Arial, sans-serif" font-size="26" fill="#98a1b3">Gihan Munasinghe · gihanmunasinghe.lk</text>
</svg>`;
}

/* Pull today's trending tech stories from free public sources (no API keys). */
async function fetchTrends() {
  const out = [];
  const grab = async (fn) => { try { await fn(); } catch (e) { console.error("trend source failed:", e.message); } };
  await grab(async () => {
    const r = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40");
    const j = await r.json();
    for (const h of j.hits || []) {
      if (!h.title) continue;
      out.push({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, score: h.points || 0, src: "HN" });
    }
  });
  await grab(async () => {
    const r = await fetch("https://dev.to/api/articles?top=1&per_page=25");
    const j = await r.json();
    for (const a of j || []) {
      if (!a.title) continue;
      out.push({ title: a.title, url: a.url, score: a.positive_reactions_count || 0, src: "dev.to", tags: (a.tag_list || []).join(",") });
    }
  });
  // keep tech-relevant, de-dup, sort by score, cap
  const KEEP = /\b(ai|llm|gpt|claude|agent|java|spring|kotlin|kafka|micro|service|cloud|aws|gcp|azure|kubernetes|k8s|docker|api|database|sql|postgres|rust|go|python|typescript|javascript|react|devops|ci\/cd|security|observability|architecture|distributed|serverless|lambda|performance|scal|open ?source|framework|compiler|linux)\b/i;
  const seen = new Set();
  return out
    .filter((t) => KEEP.test(t.title + " " + (t.tags || "")))
    .filter((t) => (seen.has(t.title) ? false : seen.add(t.title)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

async function dailyDraft() {
  const drafts = (await listPosts(true)).filter((p) => p.status === "draft");
  if (drafts.length >= 2) {
    await notify(`⏳ ${drafts.length} blog drafts already waiting`,
      `No new draft was generated today because the queue is full.\n\nReview & publish: ${SITE}/admin/`);
    return { skipped: true, pending: drafts.length };
  }
  const existing = (await listPosts(true)).map((p) => p.title).join("; ");
  const trends = await fetchTrends();

  const system = `You are the trend analyst and ghost-writer for Gihan Munasinghe's blog (${SITE}). Gihan is a software engineer, consultant and educator, strong in Java, Spring, Kafka, microservices, and cloud (AWS/GCP/Kubernetes), with a practical interest in how AI is changing engineering. Write in his first-person voice: practical, opinionated, warm, senior-but-approachable.

INTEGRITY RULES (critical):
- NEVER invent personal anecdotes, employers, job titles, years of experience, projects, or metrics. Do NOT claim where Gihan has worked. Keep it about ideas and engineering, not resume.
- You may ONLY cite URLs that appear in the TRENDING list provided below — never invent or guess URLs. Do not fabricate version numbers, benchmark figures, dates or statistics; if you're unsure of a specific number, speak qualitatively.`;

  const trendBlock = trends.length
    ? trends.map((t, i) => `${i + 1}. [${t.src}] ${t.title} — ${t.url}`).join("\n")
    : "(trend feed unavailable today)";

  const ask = `Below are today's trending software/tech headlines. Do TREND ANALYSIS: identify what is genuinely hot right now, pick ONE theme that fits Gihan's expertise and audience, and write a blog post giving his practical, opinionated take — connecting the trend to real engineering decisions (architecture, trade-offs, how to actually use or evaluate it). Reference 1-3 of the trending items and link their exact URLs. If nothing in the list fits well, choose the closest software-engineering angle and write a strong evergreen piece instead.

Avoid topics too similar to existing posts: ${existing || "(none)"}.

TRENDING NOW:
${trendBlock}

Respond with ONLY a JSON object (no markdown fences, no prose before/after):
- "slug": kebab-case url slug
- "title": post title (max 80 chars)
- "excerpt": 1-2 sentence card summary
- "readTime": like "7 min read"
- "media": one-word badge (AI, Cloud, Architecture, Security, Java, Kafka, DevOps, Leadership, ...)
- "sources": array of the trending URLs you actually referenced (only from the list above)
- "html": the FULL article body as HTML using ONLY these tags: <p>, <h2>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <pre><code>, <blockquote>. 6-10 minute read, concrete and useful, with at least one <pre><code> example where it helps. No <html>/<head>/<body> wrappers, no <img>.`;

  const text = await bedrockText(system, ask, 6000);
  const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const draft = JSON.parse(jsonStr);
  draft.coverSvg = coverSvg(draft.title, draft.media);
  const item = await savePost(draft, { asDraft: true });
  await notify(`🌅 Blog draft ready: ${item.title}`,
    `A new draft is waiting for your review.\n\nTitle: ${item.title}\n\n${item.excerpt}\n\nReview & publish: ${SITE}/admin/\n\nDrafts pending: ${drafts.length + 1}`);
  return { created: item.slug };
}

async function notify(subject, body) {
  if (!NOTIFY_EMAIL) return;
  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: NOTIFY_EMAIL,
      Destination: { ToAddresses: [NOTIFY_EMAIL] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: body } } } },
    }));
  } catch (e) { console.error("SES notify failed:", e.message); }
}

/* ---------- comments ---------- */
async function listComments(slug) {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
    ExpressionAttributeValues: { ":p": `POST#${slug}`, ":s": "COMMENT#" },
  }));
  return (out.Items || []).map(({ pk, sk, ...c }) => c);
}

/* ================= SHOP ================= */
const prodKey = (id) => ({ pk: `PRODUCT#${id}`, sk: "META" });
const pubProduct = ({ pk, sk, gsi1pk, ...p }) => p;

async function shopConfig() {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: "SETTINGS", sk: "SHOP" } }));
  return out.Item || { currency: "USD", shipPhysical: 0, shipDigital: 0, shopEnabled: true, countries: ["SG"], whatsapp: "6586469798" };
}

async function listProducts(all) {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE, IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :p",
    ExpressionAttributeValues: { ":p": "PRODUCTS" },
    ScanIndexForward: false,
  }));
  const items = (out.Items || []).map(pubProduct);
  return all ? items : items.filter((p) => p.status !== "hidden");
}
const getProduct = async (id) =>
  (await ddb.send(new GetCommand({ TableName: TABLE, Key: prodKey(id) }))).Item || null;

async function saveProduct(input) {
  const existing = input.id ? await getProduct(input.id) : null;
  const id = existing?.id || (input.id && /^[a-z0-9-]+$/.test(input.id) ? input.id
    : (clean(input.title, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + crypto.randomBytes(2).toString("hex")));
  const now = new Date().toISOString();
  const item = {
    ...prodKey(id), gsi1pk: "PRODUCTS", id,
    title: clean(input.title, 140),
    description: clean(input.description, 4000),
    category: clean(input.category, 40) || "Other",       // Books / Gaming / Other
    kind: input.kind === "digital" ? "digital" : "physical",
    condition: clean(input.condition, 40) || "Pre-loved", // Like New / Good / Fair …
    price: Math.max(0, Math.round(Number(input.price) || 0)),   // minor units (cents)
    currency: clean(input.currency, 8) || (await shopConfig()).currency,
    images: Array.isArray(input.images) ? input.images.slice(0, 8).map((u) => clean(u, 400)) : (existing?.images || []),
    stock: input.stock === undefined ? (existing?.stock ?? 1) : Math.max(0, Math.round(Number(input.stock) || 0)),
    status: input.status || existing?.status || "available",     // available | sold | hidden
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (!item.title || !item.price) throw new Error("title and price are required");
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/* Stripe REST (no SDK): form-encode nested params */
function stripeForm(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") stripeForm(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}
async function stripe(path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" },
    body: stripeForm(params).join("&"),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Stripe error");
  return j;
}
/* verify Stripe webhook signature (t + v1 HMAC-SHA256 over `${t}.${rawBody}`) */
function stripeVerify(rawBody, sigHeader) {
  const parts = Object.fromEntries((sigHeader || "").split(",").map((s) => s.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${rawBody}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected)); } catch { return false; }
}

/* ---------- handler ---------- */
export const handler = async (event) => {
  /* scheduled agent runs (only invokable via authenticated AWS invoke, not the public URL) */
  if (event.job === "daily-draft") return dailyDraft();
  if (event.job === "test-trends") return { trends: await fetchTrends() };
  if (event.job === "cors-check") {
    const base = process.env.SELF_URL || SITE;
    const O = "https://www.gihanmunasinghe.lk";
    const out = {};
    let r = await fetch(base + "/posts", { headers: { origin: O } });
    out.get_posts = { status: r.status, acao: r.headers.get("access-control-allow-origin") };
    r = await fetch(base + "/like", { method: "OPTIONS", headers: { origin: O, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    out.preflight = { status: r.status, acao: r.headers.get("access-control-allow-origin"), methods: r.headers.get("access-control-allow-methods"), headers: r.headers.get("access-control-allow-headers") };
    r = await fetch(base + "/like", { method: "POST", headers: { origin: O, "content-type": "application/json" }, body: JSON.stringify({ slug: "monolith-to-microservices-lessons", undo: true }) });
    out.post_like = { status: r.status, acao: r.headers.get("access-control-allow-origin"), body: (await r.text()).slice(0, 80) };
    return out;
  }

  const method = event.requestContext?.http?.method || "GET";
  const path = (event.rawPath || "/").replace(/\/+$/, "") || "/";

  // CORS preflight: API Gateway adds the CORS headers; we just need a 2xx status.
  if (method === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };
  const qs = event.queryStringParameters || {};
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const admin = isAdmin(event);

  try {
    if (method === "POST" && path === "/login") {
      if (!body.password || sha256(body.password) !== ADMIN_HASH)
        return res(401, { error: "Wrong password" });
      return res(200, { token: jwtSign({ role: "admin" }) });
    }

    if (method === "GET" && path === "/posts") {
      if (qs.all && !admin) return res(401, { error: "Auth required" });
      return res(200, await listPosts(Boolean(qs.all && admin)));
    }

    if (method === "GET" && path === "/post") {
      const p = await getPost(qs.slug);
      if (!p || (p.status !== "published" && !admin)) return res(404, { error: "Not found" });
      return res(200, publicPost(p, true));
    }

    if (method === "POST" && path === "/posts") {
      if (!admin && !isAgent(event)) return res(401, { error: "Auth required" });
      const item = await savePost(body, { asDraft: !admin });
      return res(200, publicPost(item, false));
    }

    if (method === "PUT" && path === "/post") {
      if (!admin) return res(401, { error: "Auth required" });
      const p = await getPost(qs.slug);
      if (!p) return res(404, { error: "Not found" });
      const a = body.action;
      if (a === "publish") p.status = "published";
      else if (a === "unpublish") p.status = "draft";
      else if (a === "toggleComments") p.commentsEnabled = p.commentsEnabled === false;
      else if (a === "update") {
        for (const k of ["title", "excerpt", "date", "readTime", "media"]) if (body[k] !== undefined) p[k] = clean(body[k], 500);
        if (body.html !== undefined) p.html = String(body.html).slice(0, 250000);
        if (body.image !== undefined) p.image = String(body.image).slice(0, 300);
        if (body.coverSvg !== undefined) p.coverSvg = String(body.coverSvg).slice(0, 20000);
      } else return res(400, { error: "Unknown action" });
      p.updatedAt = new Date().toISOString();
      await ddb.send(new PutCommand({ TableName: TABLE, Item: p }));
      return res(200, publicPost(p, false));
    }

    if (method === "DELETE" && path === "/post") {
      if (!admin) return res(401, { error: "Auth required" });
      const comments = await listComments(qs.slug);
      const keys = [{ ...postKey(qs.slug) }, ...comments.map((c) => ({ pk: `POST#${qs.slug}`, sk: `COMMENT#${c.id}` }))];
      for (let i = 0; i < keys.length; i += 25) {
        await ddb.send(new BatchWriteCommand({
          RequestItems: { [TABLE]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) },
        }));
      }
      return res(200, { deleted: qs.slug });
    }

    if (method === "GET" && path === "/comments") {
      return res(200, await listComments(qs.slug));
    }

    if (method === "POST" && path === "/comments") {
      if (body.website) return res(200, { ok: true }); // honeypot: silently drop bots
      const slug = clean(body.slug, 120);
      const p = await getPost(slug);
      if (!p || p.status !== "published") return res(404, { error: "Post not found" });
      if (p.commentsEnabled === false) return res(403, { error: "Comments are off for this post" });
      const text = clean(body.text, 2000);
      const name = clean(body.name, 60) || "Anonymous";
      if (text.length < 2) return res(400, { error: "Comment is empty" });
      const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const item = {
        pk: `POST#${slug}`, sk: `COMMENT#${id}`,
        id, name: admin ? "Gihan Munasinghe" : name, text,
        parentId: body.parentId ? clean(body.parentId, 60) : undefined,
        isOwner: Boolean(admin),
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      const { pk, sk, ...pub } = item;
      return res(200, pub);
    }

    if (method === "DELETE" && path === "/comment") {
      if (!admin) return res(401, { error: "Auth required" });
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `POST#${qs.slug}`, sk: `COMMENT#${qs.id}` } }));
      return res(200, { deleted: qs.id });
    }

    if (method === "POST" && path === "/like") {
      const slug = clean(body.slug, 120);
      try {
        const out = await ddb.send(new UpdateCommand({
          TableName: TABLE, Key: postKey(slug),
          // like: post must exist; unlike: only if the count is above zero (never go negative)
          ConditionExpression: body.undo ? "likes > :z" : "attribute_exists(pk)",
          UpdateExpression: "SET likes = if_not_exists(likes, :z) + :d",
          ExpressionAttributeValues: { ":d": body.undo ? -1 : 1, ":z": 0 },
          ReturnValues: "ALL_NEW",
        }));
        return res(200, { likes: out.Attributes.likes });
      } catch (e) {
        if (e.name === "ConditionalCheckFailedException") {
          const p = await getPost(slug);
          return res(200, { likes: p ? Math.max(0, p.likes || 0) : 0 });
        }
        throw e;
      }
    }

    if (method === "POST" && path === "/track") {
      const day = new Date().toISOString().slice(0, 10);
      const p = clean(body.path, 200) || "/";
      await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: { pk: "STATS", sk: `${day}#${p}` },
        UpdateExpression: "ADD #c :one SET #d = :d, #p = :p",
        ExpressionAttributeNames: { "#c": "count", "#d": "day", "#p": "path" },
        ExpressionAttributeValues: { ":one": 1, ":d": day, ":p": p },
      }));
      return res(200, { ok: true });
    }

    if (method === "GET" && path === "/stats") {
      if (!admin) return res(401, { error: "Auth required" });
      const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const out = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :p AND sk >= :s",
        ExpressionAttributeValues: { ":p": "STATS", ":s": start },
      }));
      const rows = out.Items || [];
      const byPath = {}, byDay = {};
      let total = 0;
      for (const r of rows) {
        total += r.count;
        byPath[r.path] = (byPath[r.path] || 0) + r.count;
        byDay[r.day] = (byDay[r.day] || 0) + r.count;
      }
      const posts = await listPosts(false);
      return res(200, {
        total,
        byDay,
        topPages: Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 20)
          .map(([path, count]) => ({ path, count })),
        engagement: posts.map((p) => ({ slug: p.slug, title: p.title, likes: p.likes || 0 })).sort((a, b) => b.likes - a.likes),
      });
    }

    /* ---------- shop: config ---------- */
    if (method === "GET" && path === "/shop-config") {
      const c = await shopConfig();
      return res(200, { currency: c.currency, shipPhysical: c.shipPhysical, shipDigital: c.shipDigital, shopEnabled: c.shopEnabled !== false, countries: c.countries, whatsapp: c.whatsapp || "", checkout: Boolean(STRIPE_SECRET) });
    }
    if (method === "PUT" && path === "/shop-config") {
      if (!admin) return res(401, { error: "Auth required" });
      const c = await shopConfig();
      const next = {
        pk: "SETTINGS", sk: "SHOP",
        currency: clean(body.currency, 8) || c.currency || "USD",
        shipPhysical: body.shipPhysical === undefined ? (c.shipPhysical || 0) : Math.max(0, Math.round(Number(body.shipPhysical) || 0)),
        shipDigital: body.shipDigital === undefined ? (c.shipDigital || 0) : Math.max(0, Math.round(Number(body.shipDigital) || 0)),
        shopEnabled: body.shopEnabled === undefined ? (c.shopEnabled !== false) : Boolean(body.shopEnabled),
        countries: Array.isArray(body.countries) ? body.countries.slice(0, 50).map((x) => clean(x, 2).toUpperCase()) : (c.countries || ["SG"]),
        whatsapp: body.whatsapp === undefined ? (c.whatsapp || "") : clean(body.whatsapp, 20).replace(/[^0-9]/g, ""),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
      return res(200, next);
    }

    /* ---------- shop: products ---------- */
    if (method === "GET" && path === "/products") {
      return res(200, await listProducts(Boolean(qs.all && admin)));
    }
    if (method === "GET" && path === "/product") {
      const p = await getProduct(qs.id);
      if (!p || (p.status === "hidden" && !admin)) return res(404, { error: "Not found" });
      return res(200, pubProduct(p));
    }
    if (method === "POST" && path === "/products") {
      if (!admin) return res(401, { error: "Auth required" });
      return res(200, pubProduct(await saveProduct(body)));
    }
    if (method === "PUT" && path === "/product") {
      if (!admin) return res(401, { error: "Auth required" });
      const p = await getProduct(qs.id);
      if (!p) return res(404, { error: "Not found" });
      const a = body.action;
      if (a === "markSold") p.status = "sold";
      else if (a === "markAvailable") { p.status = "available"; if (!p.stock) p.stock = 1; }
      else if (a === "hide") p.status = "hidden";
      else if (a === "update") return res(200, pubProduct(await saveProduct({ ...p, ...body, id: p.id })));
      else return res(400, { error: "Unknown action" });
      p.updatedAt = new Date().toISOString();
      await ddb.send(new PutCommand({ TableName: TABLE, Item: p }));
      return res(200, pubProduct(p));
    }
    if (method === "DELETE" && path === "/product") {
      if (!admin) return res(401, { error: "Auth required" });
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: prodKey(qs.id) }));
      return res(200, { deleted: qs.id });
    }

    /* ---------- shop: image upload (presigned S3 PUT) ---------- */
    if (method === "POST" && path === "/upload-url") {
      if (!admin) return res(401, { error: "Auth required" });
      if (!MEDIA_BUCKET) return res(400, { error: "Media bucket not configured" });
      const ext = (clean(body.filename, 100).split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const ct = clean(body.contentType, 100) || "image/jpeg";
      if (!ct.startsWith("image/")) return res(400, { error: "Images only" });
      const key = `products/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, ContentType: ct }), { expiresIn: 300 });
      return res(200, { uploadUrl: url, publicUrl: `${MEDIA_BASE}/${key}`, contentType: ct });
    }

    /* ---------- shop: checkout (Stripe hosted → Apple/Google Pay + cards) ---------- */
    if (method === "POST" && path === "/checkout") {
      if (!STRIPE_SECRET) return res(503, { error: "Payments not configured yet" });
      const cart = Array.isArray(body.items) ? body.items : [];
      if (!cart.length) return res(400, { error: "Cart is empty" });
      const cfg = await shopConfig();
      const line = [], ids = [];
      let anyPhysical = false;
      for (const it of cart) {
        const p = await getProduct(clean(it.id, 120));
        if (!p || p.status !== "available" || (p.stock ?? 1) < 1) return res(409, { error: `"${p?.title || it.id}" is no longer available` });
        ids.push(p.id);
        if (p.kind !== "digital") anyPhysical = true;
        line.push({
          price_data: { currency: (p.currency || cfg.currency).toLowerCase(), product_data: { name: p.title, images: (p.images || []).slice(0, 1) }, unit_amount: p.price },
          quantity: 1,
        });
      }
      const orderId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const params = {
        mode: "payment",
        success_url: `${SITE}/shop.html?success=1`,
        cancel_url: `${SITE}/shop.html?canceled=1`,
        line_items: line,
        metadata: { orderId, productIds: ids.join(",") },
        client_reference_id: orderId,
      };
      if (body.email) params.customer_email = clean(body.email, 200);
      if (anyPhysical) {
        params.shipping_address_collection = { allowed_countries: (cfg.countries && cfg.countries.length ? cfg.countries : ["SG"]) };
        if (cfg.shipPhysical > 0) params.shipping_options = [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: cfg.shipPhysical, currency: cfg.currency.toLowerCase() }, display_name: "Shipping" } }];
      }
      const session = await stripe("checkout/sessions", params);
      await ddb.send(new PutCommand({ TableName: TABLE, Item: {
        pk: `ORDER#${orderId}`, sk: "META", gsi1pk: "ORDERS", orderId, productIds: ids,
        status: "pending", amount: line.reduce((s, l) => s + l.price_data.unit_amount, 0),
        currency: cfg.currency, stripeSession: session.id, createdAt: new Date().toISOString(),
      } }));
      return res(200, { url: session.url });
    }

    /* ---------- shop: Stripe webhook ---------- */
    if (method === "POST" && path === "/stripe-webhook") {
      if (!STRIPE_WEBHOOK_SECRET) return res(503, { error: "Webhook not configured" });
      const raw = event.body || "";
      if (!stripeVerify(raw, event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"]))
        return res(400, { error: "Bad signature" });
      const evt = JSON.parse(raw);
      if (evt.type === "checkout.session.completed") {
        const s = evt.data.object;
        const orderId = s.metadata?.orderId || s.client_reference_id;
        const ids = (s.metadata?.productIds || "").split(",").filter(Boolean);
        for (const id of ids) {
          try {
            await ddb.send(new UpdateCommand({
              TableName: TABLE, Key: prodKey(id),
              UpdateExpression: "SET #s = :sold, stock = :z, updatedAt = :n",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":sold": "sold", ":z": 0, ":n": new Date().toISOString() },
            }));
          } catch (_) {}
        }
        if (orderId) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE, Key: { pk: `ORDER#${orderId}`, sk: "META" },
            UpdateExpression: "SET #st = :paid, buyerEmail = :e, buyerName = :n, shipping = :sh, paidAt = :t",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: {
              ":paid": "paid", ":e": s.customer_details?.email || "", ":n": s.customer_details?.name || "",
              ":sh": s.shipping_details ? JSON.stringify(s.shipping_details) : "", ":t": new Date().toISOString(),
            },
          })).catch(() => {});
        }
        await notify(`🛒 New order paid: ${s.metadata?.productIds || orderId}`,
          `A shop order was just paid.\n\nAmount: ${(s.amount_total / 100).toFixed(2)} ${(s.currency || "").toUpperCase()}\nBuyer: ${s.customer_details?.email || "?"}\n\nManage orders: ${SITE}/admin/`);
      }
      return res(200, { received: true });
    }

    /* ---------- shop: orders (admin) ---------- */
    if (method === "GET" && path === "/orders") {
      if (!admin) return res(401, { error: "Auth required" });
      const out = await ddb.send(new QueryCommand({
        TableName: TABLE, IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :p",
        ExpressionAttributeValues: { ":p": "ORDERS" }, ScanIndexForward: false,
      }));
      return res(200, (out.Items || []).map(({ pk, sk, gsi1pk, ...o }) => o));
    }
    if (method === "PUT" && path === "/order") {
      if (!admin) return res(401, { error: "Auth required" });
      const out = await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: { pk: `ORDER#${qs.id}`, sk: "META" },
        UpdateExpression: "SET #s = :s, updatedAt = :n",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": clean(body.status, 30) || "fulfilled", ":n": new Date().toISOString() },
        ReturnValues: "ALL_NEW",
      }));
      const { pk, sk, gsi1pk, ...o } = out.Attributes;
      return res(200, o);
    }

    /* ---------- shop: shareable product page (rich link preview for WhatsApp/social) ---------- */
    if (method === "GET" && path === "/share") {
      const id = clean(qs.id, 120);
      const dest = `${SITE}/shop.html?product=${encodeURIComponent(id)}`;
      const p = await getProduct(id);
      if (!p || p.status === "hidden") return { statusCode: 302, headers: { Location: `${SITE}/shop.html` }, body: "" };
      const img = (p.images || [])[0] || `${SITE}/assets/gihan-formal.jpg`;
      const title = `${p.title} — ${fmtMoney(p.price, p.currency)}`;
      const desc = (p.description || "Pre-loved item from Gihan's shop.").replace(/\s+/g, " ").slice(0, 180);
      const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="${escHtml(img)}">
<meta property="og:url" content="${escHtml(dest)}">
<meta property="product:price:amount" content="${((p.price || 0) / 100).toFixed(2)}">
<meta property="product:price:currency" content="${escHtml(p.currency || "USD")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:image" content="${escHtml(img)}">
<meta http-equiv="refresh" content="0; url=${escHtml(dest)}">
<script>location.replace(${JSON.stringify(dest)});</script>
</head><body style="background:#07090d;color:#98a1b3;font-family:sans-serif;padding:2rem;">
Taking you to <b>${escHtml(p.title)}</b>… <a style="color:#6ea8fe" href="${escHtml(dest)}">continue →</a>
</body></html>`;
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }, body: html };
    }

    return res(404, { error: "Not found: " + method + " " + path });
  } catch (e) {
    console.error(e);
    return res(500, { error: e.message });
  }
};
