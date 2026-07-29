/* Blog platform backend — single Lambda behind a Function URL.
 *
 * Routes (JSON):
 *   POST   /login              {password} -> {token}
 *   GET    /posts              public list (published, no html) | ?all=1 with auth includes drafts
 *   GET    /post?slug=x        full post (drafts require auth)
 *   POST   /translate          {slug,lang} -> machine-translated {title,html} (cached)
 *   POST   /posts              create/replace post (auth, or x-agent-key for the daily agent -> always draft)
 *   PUT    /post?slug=x        {action: publish|unpublish|toggleComments|update, fields?} (auth)
 *   DELETE /post?slug=x        delete post + its comments (auth)
 *   GET    /comments?slug=x    public comment list
 *   POST   /comments           {slug,name,text,parentId?,website?} public; admin JWT marks isOwner
 *   DELETE /comment?slug=x&id= (auth)
 *   POST   /like               {slug} -> {likes}
 *   POST   /track              {path,ref} pageview beacon
 *   GET    /stats              (auth) 30-day totals, per-path counts
 *   GET    /ventures           MVP/investor showcase list | ?all=1 with auth
 *   GET    /venture?id=x       one venture
 *   POST   /meeting-request    {ventureId,name,email,company,interest,message} public enquiry
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
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ses = new SESv2Client({});
const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const SELF_FN = process.env.AWS_LAMBDA_FUNCTION_NAME;

const TABLE = process.env.TABLE_NAME;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH; // sha256 hex of the admin password
const AGENT_KEY = process.env.AGENT_KEY;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0";
/* Translation needs a stronger model than drafting: Nova mixes writing systems
   (it emits Devanagari inside Sinhala) and translates too literally. Anthropic
   model entitlements on this account are intermittent, so this is a preference
   list — the first model that actually answers is used, and the script
   validator still guards whatever comes back. */
const TRANSLATE_MODEL_IDS = (process.env.TRANSLATE_MODEL_IDS ||
  [
    "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "apac.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "apac.anthropic.claude-3-sonnet-20240229-v1:0",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
    "apac.amazon.nova-pro-v1:0",
  ].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

/* Ask each candidate model in order; skip ones this account can't currently use.
   The first model that works is remembered for the life of the container, so we
   don't pay for the blocked-model round trips on every chunk. */
let workingTranslateModel = null;
async function translateModelText(system, userText, maxTokens) {
  const order = workingTranslateModel
    ? [workingTranslateModel, ...TRANSLATE_MODEL_IDS.filter((m) => m !== workingTranslateModel)]
    : TRANSLATE_MODEL_IDS;
  let lastErr;
  for (const modelId of order) {
    try {
      // Bedrock throttles when several translations run at once; back off and retry.
      let out, delay = 4000;
      for (let attempt = 0; ; attempt++) {
        try { out = await bedrockText(system, userText, maxTokens, modelId); break; }
        catch (err) {
          const throttled = err.name === "ThrottlingException" || err.name === "TooManyRequestsException" || err.$metadata?.httpStatusCode === 429;
          if (!throttled || attempt >= 5) throw err;
          await new Promise((r) => setTimeout(r, delay + Math.random() * 1000));
          delay *= 2;
        }
      }
      workingTranslateModel = modelId;
      return out;
    } catch (e) {
      lastErr = e;
      const skip = e.name === "ResourceNotFoundException" || e.name === "AccessDeniedException" || e.name === "ValidationException";
      if (workingTranslateModel === modelId) workingTranslateModel = null;   // it stopped working
      console.warn(`translate model ${modelId} unavailable (${e.name}); ${skip ? "trying next" : "aborting"}`);
      if (!skip) throw e;
    }
  }
  throw lastErr || new Error("No translation model available");
}
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
  headers: {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  },
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
async function bedrockText(system, userText, maxTokens = 4096, modelId) {
  const out = await bedrock.send(new ConverseCommand({
    modelId: modelId || BEDROCK_MODEL_ID,
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

/* ---------- SEO: URL inventory + IndexNow ---------- */
/* Every public URL on the site, used for both /sitemap.xml and IndexNow pings. */
async function siteUrls() {
  const [posts, products, ventures] = await Promise.all([listPosts(false), listProducts(false), listVentures(false)]);
  const day = (s) => (s || "").slice(0, 10);
  return [
    { loc: `${SITE}/`, freq: "weekly", pri: "1.0" },
    { loc: `${SITE}/ventures.html`, freq: "weekly", pri: "0.9" },
    ...ventures.map((v) => ({ loc: `${SITE}/ventures.html?app=${encodeURIComponent(v.id)}`, freq: "weekly", pri: "0.7", lastmod: day(v.updatedAt || v.createdAt) })),
    { loc: `${SITE}/shop.html`, freq: "daily", pri: "0.8" },
    ...posts.map((p) => ({ loc: `${SITE}/blog/post.html?slug=${encodeURIComponent(p.slug)}`, freq: "monthly", pri: "0.7", lastmod: day(p.updatedAt || p.createdAt) })),
    ...products.map((p) => ({ loc: `${SITE}/shop.html?product=${encodeURIComponent(p.id)}`, freq: "weekly", pri: "0.6", lastmod: day(p.updatedAt || p.createdAt) })),
  ];
}

/* IndexNow: instantly tell Bing / DuckDuckGo / Yandex that URLs are new or changed.
   The key is served as a static file at SITE/<key>.txt, which is how they verify us. */
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "f9d45a96a87d03dae7ad4ef3bb3677f1";
async function indexNow(urlList) {
  const urls = (Array.isArray(urlList) ? urlList : [urlList]).filter(Boolean).slice(0, 10000);
  if (!urls.length) return { skipped: true };
  const host = new URL(SITE).host;
  try {
    const r = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls }),
    });
    return { status: r.status, submitted: urls.length };
  } catch (e) {
    console.error("IndexNow failed:", e.message);
    return { error: e.message };
  }
}
/* fire-and-forget ping so admin actions stay fast */
const pingIndexNow = (urls) => { try { indexNow(urls).catch(() => {}); } catch {} };

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

/* ---------- live translation (Amazon Bedrock) ---------- */
/* Languages readers can translate a post into (English is the original).
   Amazon Translate isn't enabled on this account, so we translate with Bedrock.
   Translation uses a stronger model than the drafting one: smaller models leak
   characters from other scripts (e.g. Devanagari into Sinhala) and translate
   too literally. Every translation is then proofread by a second pass and
   validated for script purity before it is cached. */
const XLATE_LANGS = { zh: "Chinese", ms: "Malay", ta: "Tamil", si: "Sinhala", hi: "Hindi" };
const LANG_FULL = { zh: "Simplified Chinese", ms: "Malay (Bahasa Melayu)", ta: "Tamil", si: "Sinhala", hi: "Hindi" };
/* bump when translation quality logic changes — old cached translations regenerate */
const XLATE_VERSION = 3;
const byteLen = (s) => Buffer.byteLength(s, "utf8");

/* Unicode blocks per writing system, used to catch a model emitting the wrong
   script (the "සබ → सब" class of bug). Latin/digits/punctuation are always fine
   because technical terms stay in English. */
const SCRIPT_RANGES = {
  sinhala: /[඀-෿]/g,
  tamil: /[஀-௿]/g,
  devanagari: /[ऀ-ॿ]/g,
  bengali: /[ঀ-৿]/g,
  gujarati: /[઀-૿]/g,
  telugu: /[ఀ-౿]/g,
  kannada: /[ಀ-೿]/g,
  malayalam: /[ഀ-ൿ]/g,
  thai: /[฀-๿]/g,
  arabic: /[؀-ۿ]/g,
  cjk: /[㐀-䶿一-鿿]/g,
  hangul: /[가-힯]/g,
  kana: /[぀-ヿ]/g,
};
const LANG_SCRIPT = { si: "sinhala", ta: "tamil", hi: "devanagari", zh: "cjk", ms: null };

/* Characters present that belong to a script the target language never uses. */
function foreignScriptChars(text, lang) {
  const own = LANG_SCRIPT[lang];
  const bad = new Set();
  for (const [name, re] of Object.entries(SCRIPT_RANGES)) {
    if (name === own) continue;
    if (own === "cjk" && (name === "kana" || name === "hangul")) continue; // tolerate CJK neighbours
    const hits = text.match(re);
    if (hits) hits.forEach((c) => bad.add(c));
  }
  return [...bad];
}

/* Split an HTML fragment into pieces under maxBytes, cutting ONLY at the end of a
   top-level element so tags are never broken across a chunk. Small chunks keep
   each translation call comfortably inside the model's output-token budget. */
function chunkHtml(html, maxBytes = 12000) {
  if (byteLen(html) <= maxBytes) return [html];
  const segs = [];
  const tagRe = /<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g;
  let depth = 0, last = 0, m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    if (/\/>$/.test(m[0]) || /^(br|hr|img|input|meta|link|source|col|area)$/.test(tag)) continue; // void
    if (m[0][1] === "/") { if (--depth === 0) { segs.push(html.slice(last, tagRe.lastIndex)); last = tagRe.lastIndex; } }
    else depth++;
  }
  if (last < html.length) segs.push(html.slice(last));
  const chunks = [];
  let cur = "";
  for (const s of segs) {
    if (cur && byteLen(cur + s) > maxBytes) { chunks.push(cur); cur = ""; }
    cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const stripFence = (s) => s.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

/* ---------- engine 1: Google Cloud Translation (preferred) ----------
   A dedicated NMT service. Noticeably better than a general-purpose LLM for
   low-resource languages such as Sinhala, and it never wanders off-task the way
   a chat model can. Free for the first 500k characters per month. */
const GOOGLE_TRANSLATE_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "";
const decodeEntities = (s) => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&");

/* Google honours translate="no", so code stays untouched. */
const protectCode = (html) => html
  .replace(/<pre(\s|>)/gi, '<pre translate="no"$1')
  .replace(/<code(\s|>)/gi, '<code translate="no"$1');
const unprotectCode = (html) => html.replace(/\s*translate=["']no["']/gi, "");

async function googleTranslate(input, lang, isHtml) {
  const body = new URLSearchParams();
  body.append("q", isHtml ? protectCode(input) : input);
  body.append("source", "en");
  body.append("target", lang);
  body.append("format", isHtml ? "html" : "text");
  const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await r.json();
  if (!r.ok || !j.data?.translations?.length) {
    const msg = j.error?.message || `HTTP ${r.status}`;
    const e = new Error(`Google Translate: ${msg}`);
    e.googleStatus = r.status;
    throw e;
  }
  const out = j.data.translations[0].translatedText || "";
  return isHtml ? unprotectCode(out) : decodeEntities(out);
}

/* Shared rules so the translate and proofread passes agree on what "correct" is. */
const langRules = (lang) => `Language rules for ${LANG_FULL[lang]}:
- Write ONLY in the ${LANG_FULL[lang]} script. Never emit characters from any other writing system (for example Devanagari characters must never appear in Sinhala or Tamil text). Latin letters are allowed ONLY for technical terms and product names.
- Use natural, grammatical, idiomatic ${LANG_FULL[lang]} as a native speaker writes it — correct word order, verb forms, agreement and particles. Do NOT translate word-by-word from English.
- Keep well-known technical terms and product names in English where a native engineer would (e.g. Kubernetes, Lambda, API, Kafka, microservices).
- Never transliterate an English word into the local script when a real ${LANG_FULL[lang]} word exists; equally, do not invent words.`;

/* Second pass: a native-speaker proofread of the machine translation, with the
   English source alongside so meaning can be checked, not just fluency. */
async function proofread(translated, source, lang, isHtml, problems) {
  const sys = `You are a meticulous native ${LANG_FULL[lang]} editor proofreading a machine translation of a technical blog for publication.

${langRules(lang)}

Your job:
- Compare against the English source and fix anything that is wrong, unnatural, ungrammatical, or literally translated.
- Fix spelling, grammar, agreement and punctuation errors.
- Remove or correct any character that belongs to a different writing system.
${isHtml ? "- Keep every HTML tag, attribute and URL EXACTLY as-is, and leave <code>/<pre> contents untouched." : ""}
- Preserve the author's meaning and tone. Do not add or drop information.

Output ONLY the corrected ${isHtml ? "HTML fragment" : "text"} — no commentary, no markdown fences, no alternatives.${problems && problems.length ? `\n\nA validator flagged these characters as belonging to the wrong script — they MUST NOT appear in your output: ${problems.join(" ")}` : ""}`;
  const user = `ENGLISH SOURCE:\n${source}\n\n---\n\n${LANG_FULL[lang].toUpperCase()} TRANSLATION TO PROOFREAD:\n${translated}`;
  const out = await translateModelText(sys, user, isHtml ? 6000 : 1500);
  return stripFence(out) || translated;
}

/* Translate → proofread → validate. If the validator still finds foreign-script
   characters, one more targeted repair pass is attempted before giving up. */
async function translateAndCheck(source, lang, isHtml) {
  /* Preferred path: Google NMT, then validate the script. Only if Google is
     unavailable (no key / quota / error) do we fall back to the LLM engine. */
  if (GOOGLE_TRANSLATE_KEY) {
    try {
      const out = await googleTranslate(source, lang, isHtml);
      let bad = foreignScriptChars(out, lang);
      if (bad.length) {
        console.warn(`google output script issues (${lang}):`, bad.join(" "));
        const repaired = await proofread(out, source, lang, isHtml, bad).catch(() => out);
        const stillBad = foreignScriptChars(repaired, lang);
        return { text: stillBad.length > bad.length ? out : repaired, issues: stillBad, engine: "google+repair" };
      }
      return { text: out, issues: [], engine: "google" };
    } catch (e) {
      console.error(`Google translate failed (${lang}), falling back to LLM:`, e.message);
    }
  }
  return llmTranslateAndCheck(source, lang, isHtml);
}

async function llmTranslateAndCheck(source, lang, isHtml) {
  const sys = isHtml
    ? `You localize a technical blog into ${LANG_FULL[lang]}. You receive an HTML fragment and return the SAME fragment with only the human-readable text translated.

${langRules(lang)}

- Keep every HTML tag, attribute and URL EXACTLY as-is; do not add, remove or reorder tags.
- Do NOT translate anything inside <code> or <pre> tags — leave all code, commands and identifiers unchanged.
- Output ONLY the translated HTML fragment — no markdown code fences, no commentary.`
    : `You are a professional translator rendering English into ${LANG_FULL[lang]}.

${langRules(lang)}

You are translating a single short headline. Reply with ONLY that translated headline on ONE line — no quotes, no notes, no alternatives, no English gloss, and never any article text after it.`;
  let out = stripFence(await translateModelText(sys, source, isHtml ? 6000 : 1200)) || source;
  out = await proofread(out, source, lang, isHtml, foreignScriptChars(out, lang));
  let bad = foreignScriptChars(out, lang);
  if (bad.length) {
    console.warn(`translation script issues (${lang}):`, bad.join(" "));
    out = await proofread(out, source, lang, isHtml, bad);
    bad = foreignScriptChars(out, lang);
    if (bad.length) console.error(`translation still has foreign script (${lang}):`, bad.join(" "));
  }
  return { text: out, issues: bad };
}

/* A title must stay a single line: models sometimes append the article body or
   a note after it. Keep the first real line and drop any decoration. */
function cleanTitle(s, fallback) {
  let t = String(s || "").trim();
  t = t.split(/\r?\n/).find((l) => l.trim()) || "";
  t = t.replace(/^\s*(?:#+\s*|["'“”‘’]+)/, "").replace(/["'“”‘’]+\s*$/, "");
  t = t.replace(/\*\*/g, "").replace(/\s*[-–—]{3,}\s*$/, "").trim();
  return t.slice(0, 200) || String(fallback || "").slice(0, 200);
}

async function mtText(text, lang) {
  if (!text || !text.trim()) return { text, issues: [] };
  const r = await translateAndCheck(text.slice(0, 4000), lang, false);
  return { ...r, text: cleanTitle(r.text, text) };
}

async function mtHtml(html, lang) {
  if (!html || !html.trim()) return { text: html, issues: [] };
  const parts = [], issues = [];
  let engine;
  for (const chunk of chunkHtml(html)) {
    const r = await translateAndCheck(chunk, lang, true);
    parts.push(r.text);
    issues.push(...r.issues);
    engine = r.engine;
  }
  return { text: parts.join(""), issues, engine };
}

/* Translate a post's title + body, caching the result per language keyed to the
   post's updatedAt so an edit auto-invalidates and each post/language pair is
   only ever machine-translated once. */
const xlateKey = (slug, lang) => ({ pk: `POST#${slug}`, sk: `XLATE#${lang}` });
/* Content is usable when it was made from this revision of the post by this
   engine version. A concurrent "pending" marker doesn't hide existing content. */
const xlateFresh = (row, post) =>
  Boolean(row && row.title && row.html && row.srcUpdatedAt === post.updatedAt && row.v === XLATE_VERSION);

/* Look up a cached translation (fresh = same source revision and same engine version). */
async function getTranslation(slug, lang, admin) {
  const post = await getPost(slug);
  if (!post || (post.status !== "published" && !admin)) return { missing: true };
  const row = (await ddb.send(new GetCommand({ TableName: TABLE, Key: xlateKey(slug, lang) }))).Item;
  if (xlateFresh(row, post)) return { post, ready: { slug, lang, title: cleanTitle(row.title, post.title), html: row.html, cached: true } };
  const inFlight = row && row.status === "pending" && Date.now() - new Date(row.startedAt || 0).getTime() < 5 * 60e3;
  return { post, row, inFlight };
}

/* Do the actual work: translate title + body, proofread, validate, then cache.
   Runs in a background invocation because it takes longer than the API gateway
   request timeout. */
async function runTranslation(slug, lang) {
  const post = await getPost(slug);
  if (!post) return { error: "post not found" };
  // Mark in-flight WITHOUT destroying an existing translation: if this run fails
  // or is retried, readers keep seeing the previous good text.
  await ddb.send(new UpdateCommand({
    TableName: TABLE, Key: xlateKey(slug, lang),
    UpdateExpression: "SET #s = :p, startedAt = :t, lang = :l, v = :v",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":p": "pending", ":t": new Date().toISOString(), ":l": lang, ":v": XLATE_VERSION },
  })).catch(() => {});
  let t, h;
  try {
    [t, h] = await Promise.all([mtText(post.title, lang), mtHtml(post.html || "", lang)]);
  } catch (e) {
    console.error(`translation failed (${slug}/${lang}):`, e.message);
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: xlateKey(slug, lang) })).catch(() => {});
    throw e;
  }
  const issues = [...t.issues, ...h.issues];
  await ddb.send(new PutCommand({ TableName: TABLE, Item: {
    ...xlateKey(slug, lang), lang, title: t.text, html: h.text,
    srcUpdatedAt: post.updatedAt, v: XLATE_VERSION, status: "ready", engine: h.engine || t.engine,
    scriptIssues: issues.length ? issues.join(" ") : undefined,
    createdAt: new Date().toISOString(),
  } }));
  return { slug, lang, chars: h.text.length, issues };
}

/* Kick off a background translation (fire-and-forget async Lambda invocation). */
async function startTranslation(slug, lang) {
  try {
    await lambda.send(new InvokeCommand({
      FunctionName: SELF_FN,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ job: "translate-one", slug, lang })),
    }));
    return true;
  } catch (e) { console.error("startTranslation failed:", e.message); return false; }
}

/* ================= VENTURES (MVP / investor showcase) ================= */
const ventKey = (id) => ({ pk: `VENTURE#${id}`, sk: "META" });
const pubVenture = ({ pk, sk, gsi1pk, ...v }) => v;

async function listVentures(all) {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE, IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :p",
    ExpressionAttributeValues: { ":p": "VENTURES" },
    ScanIndexForward: false,
  }));
  const items = (out.Items || []).map(pubVenture).sort((a, b) => (a.order || 0) - (b.order || 0));
  return all ? items : items.filter((v) => v.status !== "hidden");
}
const getVenture = async (id) =>
  (await ddb.send(new GetCommand({ TableName: TABLE, Key: ventKey(id) }))).Item || null;

/* A list of {label, state} items — used for both MVP scope and roadmap stages. */
const cleanSteps = (arr, max = 24) =>
  (Array.isArray(arr) ? arr : []).slice(0, max).map((s) => ({
    label: clean(s && s.label, 160),
    detail: clean(s && s.detail, 600),
    state: ["done", "building", "planned"].includes(s && s.state) ? s.state : "planned",
  })).filter((s) => s.label);

async function saveVenture(input) {
  const existing = input.id ? await getVenture(input.id) : null;
  const id = existing?.id || (input.id && /^[a-z0-9-]+$/.test(input.id) ? input.id
    : clean(input.name, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || crypto.randomBytes(3).toString("hex"));
  const now = new Date().toISOString();
  const item = {
    ...ventKey(id), gsi1pk: "VENTURES", id,
    name: clean(input.name, 120),
    tagline: clean(input.tagline, 220),
    category: clean(input.category, 60) || "Product",
    stage: ["idea", "prototype", "mvp", "beta", "live"].includes(input.stage) ? input.stage : "mvp",
    overview: String(input.overview ?? existing?.overview ?? "").slice(0, 20000),   // HTML
    problem: clean(input.problem, 1200),
    solution: clean(input.solution, 1200),
    demoUrl: clean(input.demoUrl, 400),          // YouTube/Vimeo/loom link
    liveUrl: clean(input.liveUrl, 400),
    repoUrl: clean(input.repoUrl, 400),
    images: Array.isArray(input.images) ? input.images.slice(0, 10).map((u) => clean(u, 400)) : (existing?.images || []),
    // inline SVG cover, used when no screenshot has been uploaded yet
    coverSvg: typeof input.coverSvg === "string" ? input.coverSvg.slice(0, 20000) : existing?.coverSvg,
    tech: Array.isArray(input.tech) ? input.tech.slice(0, 30).map((t) => clean(t, 40)).filter(Boolean) : (existing?.tech || []),
    mvp: input.mvp === undefined ? (existing?.mvp || []) : cleanSteps(input.mvp),
    roadmap: input.roadmap === undefined ? (existing?.roadmap || []) : cleanSteps(input.roadmap),
    lookingFor: Array.isArray(input.lookingFor) ? input.lookingFor.slice(0, 10).map((t) => clean(t, 80)).filter(Boolean) : (existing?.lookingFor || []),
    ask: clean(input.ask, 400),                  // optional, e.g. "Seed round — details on request"
    status: ["visible", "hidden"].includes(input.status) ? input.status : (existing?.status || "visible"),
    order: input.order === undefined ? (existing?.order ?? 0) : Math.round(Number(input.order) || 0),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (!item.name) throw new Error("name is required");
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/* ---------- meeting / investment enquiries ---------- */
async function listMeetings() {
  const out = await ddb.send(new QueryCommand({
    TableName: TABLE, IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :p",
    ExpressionAttributeValues: { ":p": "MEETINGS" }, ScanIndexForward: false,
  }));
  return (out.Items || []).map(({ pk, sk, gsi1pk, ...m }) => m);
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
  if (event.job === "translate-sample") {   // quick side-by-side quality check
    const text = event.text || "I have spent a large part of the last eight years pulling legacy platforms apart. Different domains, same gravity: the monolith always resists.";
    const out = {};
    for (const lang of event.langs || ["si", "ta"]) {
      out[lang] = {};
      if (GOOGLE_TRANSLATE_KEY) {
        try { const g = await googleTranslate(text, lang, false); out[lang].google = { text: g, issues: foreignScriptChars(g, lang) }; }
        catch (e) { out[lang].google = { error: e.message }; }
      } else out[lang].google = { error: "no API key set" };
      try { const l = await llmTranslateAndCheck(text, lang, false); out[lang].llm = { text: l.text, issues: l.issues }; }
      catch (e) { out[lang].llm = { error: e.message }; }
    }
    return out;
  }
  if (event.job === "translate-one") return runTranslation(event.slug, event.lang);
  if (event.job === "translate-post") {   // warm every language for one post
    for (const l of Object.keys(XLATE_LANGS)) await startTranslation(event.slug, l);
    return { warming: event.slug, langs: Object.keys(XLATE_LANGS) };
  }
  if (event.job === "indexnow-all") {
    const urls = (await siteUrls()).map((u) => u.loc);
    return { ...(await indexNow(urls)), urls };
  }
  if (event.job === "seo-check") {
    const out = {};
    for (const p of event.paths || ["/", "/shop.html", "/robots.txt", "/sitemap.xml", `/${INDEXNOW_KEY}.txt`]) {
      try {
        const r = await fetch(SITE + p, { headers: { "user-agent": "Mozilla/5.0 (compatible; SEOCheck/1.0)" } });
        const body = await r.text();
        const pick = (re) => { const m = body.match(re); return m ? m[1].trim() : null; };
        out[p] = {
          status: r.status,
          hsts: r.headers.get("strict-transport-security"),
          xfo: r.headers.get("x-frame-options"),
          csp_header: Boolean(r.headers.get("content-security-policy")),
          title: pick(/<title>([^<]*)<\/title>/i),
          description: pick(/<meta name="description" content="([^"]*)"/i),
          canonical: pick(/<link rel="canonical"[^>]*href="([^"]*)"/i),
          og_title: pick(/<meta property="og:title" content="([^"]*)"/i),
          jsonld: (body.match(/application\/ld\+json/g) || []).length,
          csp_meta: /http-equiv="Content-Security-Policy"/i.test(body),
          bytes: body.length,
        };
      } catch (e) { out[p] = { error: e.message }; }
    }
    return out;
  }
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

    /* live translation: cached result, or start one in the background and let
       the page poll (a full translate+proofread pass outlives the HTTP timeout) */
    if (method === "POST" && path === "/translate") {
      const slug = clean(body.slug, 120);
      const lang = clean(body.lang, 10).toLowerCase();
      if (!XLATE_LANGS[lang]) return res(400, { error: "Unsupported language" });
      const t = await getTranslation(slug, lang, admin);
      if (t.missing) return res(404, { error: "Post not found" });
      if (t.ready) return res(200, t.ready);
      if (!t.inFlight) await startTranslation(slug, lang);
      // Still include readable content with the "pending" flag: a previous
      // translation if we have one, otherwise the English original. Clients that
      // don't poll then show real text instead of nothing.
      return res(202, {
        pending: true, slug, lang,
        title: cleanTitle((t.row && t.row.title) || t.post.title, t.post.title),
        html: (t.row && t.row.html) || t.post.html || "",
      });
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
      // tell search engines straight away when a live post appears or changes
      if (p.status === "published") {
        pingIndexNow([`${SITE}/blog/post.html?slug=${encodeURIComponent(p.slug)}`, `${SITE}/`]);
        // warm translations in the background so readers get them instantly
        for (const l of Object.keys(XLATE_LANGS)) startTranslation(p.slug, l).catch(() => {});
      }
      return res(200, publicPost(p, false));
    }

    if (method === "DELETE" && path === "/post") {
      if (!admin) return res(401, { error: "Auth required" });
      const comments = await listComments(qs.slug);
      const keys = [
        { ...postKey(qs.slug) },
        ...comments.map((c) => ({ pk: `POST#${qs.slug}`, sk: `COMMENT#${c.id}` })),
        ...Object.keys(XLATE_LANGS).map((l) => ({ pk: `POST#${qs.slug}`, sk: `XLATE#${l}` })),
      ];
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

    /* ---------- ventures (MVP showcase) ---------- */
    if (method === "GET" && path === "/ventures") {
      return res(200, await listVentures(Boolean(qs.all && admin)));
    }
    if (method === "GET" && path === "/venture") {
      const v = await getVenture(qs.id);
      if (!v || (v.status === "hidden" && !admin)) return res(404, { error: "Not found" });
      return res(200, pubVenture(v));
    }
    if (method === "POST" && path === "/ventures") {
      if (!admin) return res(401, { error: "Auth required" });
      const saved = await saveVenture(body);
      pingIndexNow([`${SITE}/ventures.html`, `${SITE}/ventures.html?app=${encodeURIComponent(saved.id)}`]);
      return res(200, pubVenture(saved));
    }
    if (method === "PUT" && path === "/venture") {
      if (!admin) return res(401, { error: "Auth required" });
      const v = await getVenture(qs.id);
      if (!v) return res(404, { error: "Not found" });
      if (body.action === "hide") v.status = "hidden";
      else if (body.action === "show") v.status = "visible";
      else if (body.action === "update") return res(200, pubVenture(await saveVenture({ ...v, ...body, id: v.id })));
      else return res(400, { error: "Unknown action" });
      v.updatedAt = new Date().toISOString();
      await ddb.send(new PutCommand({ TableName: TABLE, Item: v }));
      return res(200, pubVenture(v));
    }
    if (method === "DELETE" && path === "/venture") {
      if (!admin) return res(401, { error: "Auth required" });
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: ventKey(qs.id) }));
      return res(200, { deleted: qs.id });
    }

    /* ---------- meeting / investment enquiries ---------- */
    if (method === "POST" && path === "/meeting-request") {
      if (body.website) return res(200, { ok: true });               // honeypot
      const name = clean(body.name, 100);
      const email = clean(body.email, 200);
      const message = clean(body.message, 3000);
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res(400, { error: "Name and a valid email are required" });
      const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const ventureId = clean(body.ventureId, 120);
      const venture = ventureId ? await getVenture(ventureId) : null;
      const item = {
        pk: `MEETING#${id}`, sk: "META", gsi1pk: "MEETINGS", id,
        ventureId, ventureName: venture?.name || "",
        name, email,
        company: clean(body.company, 160),
        interest: clean(body.interest, 60) || "General",
        message,
        status: "new",
        createdAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      await notify(`🤝 Meeting request: ${item.ventureName || "General"} — ${name}`,
        `New enquiry from the ventures page.\n\nName: ${name}\nEmail: ${email}\nCompany: ${item.company || "-"}\nInterest: ${item.interest}\nProject: ${item.ventureName || "-"}\n\nMessage:\n${message || "(none)"}\n\nManage: ${SITE}/admin/`);
      return res(200, { ok: true, id });
    }
    if (method === "GET" && path === "/meeting-requests") {
      if (!admin) return res(401, { error: "Auth required" });
      return res(200, await listMeetings());
    }
    if (method === "PUT" && path === "/meeting-request") {
      if (!admin) return res(401, { error: "Auth required" });
      const out = await ddb.send(new UpdateCommand({
        TableName: TABLE, Key: { pk: `MEETING#${qs.id}`, sk: "META" },
        UpdateExpression: "SET #s = :s, updatedAt = :n",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": clean(body.status, 30) || "done", ":n": new Date().toISOString() },
        ReturnValues: "ALL_NEW",
      }));
      const { pk, sk, gsi1pk, ...m } = out.Attributes;
      return res(200, m);
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
      const saved = await saveProduct(body);
      pingIndexNow([`${SITE}/shop.html`, `${SITE}/shop.html?product=${encodeURIComponent(saved.id)}`]);
      return res(200, pubProduct(saved));
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

    /* ---------- SEO: dynamic sitemap (home, shop, published posts, visible products) ---------- */
    if (method === "GET" && path === "/sitemap.xml") {
      const urls = await siteUrls();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((u) => `  <url><loc>${escHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n") +
        `\n</urlset>`;
      return { statusCode: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" }, body: xml };
    }

    /* ---------- SEO: server-rendered blog post (crawlers + rich share previews) ----------
       The public page renders client-side, so crawlers that don't run JavaScript
       (and social preview bots) would otherwise see an empty "Loading…" shell.
       This returns the real article as HTML with full metadata. Same content as
       the JS page — a Cloudflare Worker routes bots here (see docs/). */
    if (method === "GET" && (path === "/post-html" || path === "/share-post")) {
      const slug = clean(qs.slug, 120);
      const p = await getPost(slug);
      const dest = `${SITE}/blog/post.html?slug=${encodeURIComponent(slug)}`;
      if (!p || p.status !== "published")
        return { statusCode: 302, headers: { Location: `${SITE}/#blog` }, body: "" };
      const humanRedirect = path === "/share-post";   // share links bounce humans to the real page
      const img = p.image
        ? (/^https?:\/\//.test(p.image) ? p.image : `${SITE}/${String(p.image).replace(/^\//, "")}`)
        : `${SITE}/assets/gihan-formal.jpg`;
      const desc = (p.excerpt || p.title || "").replace(/\s+/g, " ").slice(0, 200);
      const ld = {
        "@context": "https://schema.org", "@type": "BlogPosting",
        headline: p.title, description: desc, url: dest, mainEntityOfPage: dest, image: img, inLanguage: "en",
        datePublished: p.createdAt, dateModified: p.updatedAt,
        author: { "@type": "Person", name: "Gihan Munasinghe", url: `${SITE}/` },
        publisher: { "@type": "Person", name: "Gihan Munasinghe", url: `${SITE}/` },
      };
      const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(p.title)} — Gihan Munasinghe</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${escHtml(dest)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Gihan Munasinghe">
<meta property="og:title" content="${escHtml(p.title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="${escHtml(img)}">
<meta property="og:url" content="${escHtml(dest)}">
<meta property="article:published_time" content="${escHtml(p.createdAt || "")}">
<meta property="article:author" content="Gihan Munasinghe">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(p.title)}">
<meta name="twitter:description" content="${escHtml(desc)}">
<meta name="twitter:image" content="${escHtml(img)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${humanRedirect ? `<script>location.replace(${JSON.stringify(dest)});</script>` : ""}
<style>body{background:#07090d;color:#c6ccd8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.75;margin:0;padding:2rem 1.4rem 4rem}main{max-width:720px;margin:0 auto}h1{color:#eef1f7;font-size:2rem;line-height:1.2;margin:0 0 .6rem}h2{color:#eef1f7;margin:2rem 0 .8rem}a{color:#6ea8fe}.meta{color:#98a1b3;font-size:.9rem;margin-bottom:1.6rem}pre{background:#0d1118;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:1rem;overflow-x:auto}img{max-width:100%;height:auto;border-radius:12px}blockquote{border-left:3px solid #8b5cf6;background:rgba(139,92,246,.08);margin:0 0 1rem;padding:.8rem 1.2rem;border-radius:0 12px 12px 0}</style>
</head><body><main>
<article>
<h1>${escHtml(p.title)}</h1>
<div class="meta">By <a href="${SITE}/">Gihan Munasinghe</a> · ${escHtml(p.date || "")} · ${escHtml(p.readTime || "")}</div>
${p.html || ""}
</article>
${Array.isArray(p.sources) && p.sources.length ? `<h2>Sources</h2><ul>${p.sources.map((s) => `<li><a href="${escHtml(s)}" rel="noopener">${escHtml(s)}</a></li>`).join("")}</ul>` : ""}
<p><a href="${escHtml(dest)}">Read this post on gihanmunasinghe.lk →</a></p>
<p><a href="${SITE}/">← More from Gihan Munasinghe</a></p>
</main></body></html>`;
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }, body: html };
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
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }, body: html };
    }

    return res(404, { error: "Not found: " + method + " " + path });
  } catch (e) {
    console.error(e);
    return res(500, { error: e.message });
  }
};
