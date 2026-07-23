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

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ses = new SESv2Client({});
const bedrock = new BedrockRuntimeClient({});

const TABLE = process.env.TABLE_NAME;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH; // sha256 hex of the admin password
const AGENT_KEY = process.env.AGENT_KEY;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SITE = process.env.SITE_URL || "https://www.gihanmunasinghe.lk";

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

async function dailyDraft() {
  const drafts = (await listPosts(true)).filter((p) => p.status === "draft");
  if (drafts.length >= 2) {
    await notify(`⏳ ${drafts.length} blog drafts already waiting`,
      `No new draft was generated today because the queue is full.\n\nReview & publish: ${SITE}/admin/`);
    return { skipped: true, pending: drafts.length };
  }
  const existing = (await listPosts(true)).map((p) => p.title).join("; ");
  const system = `You draft blog posts for Gihan Munasinghe (${SITE}), a Singapore-based tech lead with 8+ years in banking, telecom and e-commerce; expert in Java, Spring, Kafka, microservices, AWS/GCP/Kubernetes; also a consultant and educator. Write in his first-person voice: practical, professional, warm, opinionated but grounded.

INTEGRITY RULES (critical):
- NEVER invent personal anecdotes, employers, projects, dates or metrics beyond the profile above.
- You do NOT have live internet access. Do NOT cite breaking news, version numbers, release dates, benchmark figures or statistics you are not certain about, and NEVER fabricate URLs. Prefer timeless, concept-driven engineering writing. If you reference a canonical source, use only well-known stable ones (e.g. the official Kafka, Spring, AWS, or Kubernetes documentation) and keep "sources" empty if unsure.`;
  const ask = `Write ONE substantive, evergreen software-engineering blog post on a topic that fits Gihan's expertise and would genuinely help senior engineers, tech leads or teams. Choose a fresh angle NOT similar to these existing posts: ${existing || "(none)"}.

Good topic areas: microservices & distributed systems patterns, event-driven architecture with Kafka, Java/Spring performance & design, cloud architecture on AWS/GCP, Kubernetes in production, API design, observability, engineering leadership, or pragmatic adoption of AI tooling in engineering teams.

Respond with ONLY a JSON object (no markdown fences, no prose before or after) with keys:
- "slug": kebab-case url slug
- "title": post title (max 80 chars)
- "excerpt": 1-2 sentence card summary
- "readTime": like "7 min read"
- "media": one-word badge (AI, Cloud, Architecture, Security, Java, Kafka, Leadership, ...)
- "sources": array of stable canonical URLs actually referenced (may be empty)
- "html": the FULL article body as HTML using ONLY these tags: <p>, <h2>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <pre><code>, <blockquote>. 6-10 minute read, with concrete guidance and at least one <pre><code> example where useful. No <html>/<head>/<body> wrappers and no <img>.`;
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

/* ---------- handler ---------- */
export const handler = async (event) => {
  /* scheduled agent runs */
  if (event.job === "daily-draft") return dailyDraft();

  const method = event.requestContext?.http?.method || "GET";
  const path = (event.rawPath || "/").replace(/\/+$/, "") || "/";
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
      const out = await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: postKey(slug),
        ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "ADD likes :one",
        ExpressionAttributeValues: { ":one": body.undo ? -1 : 1 },
        ReturnValues: "ALL_NEW",
      }));
      return res(200, { likes: Math.max(0, out.Attributes.likes) });
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

    return res(404, { error: "Not found: " + method + " " + path });
  } catch (e) {
    console.error(e);
    return res(500, { error: e.message });
  }
};
