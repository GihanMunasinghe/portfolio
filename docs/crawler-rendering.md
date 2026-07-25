# Server-side rendering for crawlers (dynamic rendering)

Blog posts render client-side: the HTML shell loads, then JavaScript fetches the
post from the API. Google executes JavaScript, but it crawls such pages more
slowly and less reliably — and most non-Google crawlers (LinkedIn, Facebook,
Slack, Bing's preview bot, many AI crawlers) don't run JavaScript at all, so they
see an empty "Loading…" page.

Two pieces solve this:

1. **Already shipped** — the API renders real HTML for a post:
   - `GET https://api.gihanmunasinghe.lk/post-html?slug=<slug>` → full article HTML
     with title, description, canonical, Open Graph/Twitter tags and `BlogPosting`
     JSON-LD. No redirect (for bots).
   - `GET https://api.gihanmunasinghe.lk/share-post?slug=<slug>` → same, but
     redirects a human browser to the real page. **The blog's share buttons now
     use this**, so LinkedIn/WhatsApp/Facebook previews show the real post title,
     description and image instead of "Loading…".
2. **Optional (below)** — a Cloudflare Worker so crawlers hitting your *real*
   URLs get the rendered HTML, while humans get the normal interactive page.

> This is **dynamic rendering**, not cloaking: bots and humans get the same
> content, just pre-rendered for bots. Cloaking is serving *different* content —
> don't change the Worker to do that.

---

## Cloudflare Worker setup

**Prerequisite:** `www` (and apex) must be **proxied** (orange cloud) — the same
prerequisite as the security headers in `docs/cloudflare-security.md`.
Leave the `api` record **DNS-only**.

1. Cloudflare dashboard → **Workers & Pages → Create → Create Worker**.
2. Name it `blog-prerender`, click **Deploy**, then **Edit code**.
3. Replace the contents with:

```js
// Serve crawlers a server-rendered version of blog posts.
// Humans are untouched and get the normal client-rendered page.
const BOT = /(googlebot|bingbot|yandex|duckduckbot|baiduspider|slurp|applebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|embedly|quora link preview|pinterest|redditbot|petalbot|gptbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|amazonbot|bytespider)/i;
const API = "https://api.gihanmunasinghe.lk";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";

    const isPost = url.pathname === "/blog/post.html" && url.searchParams.has("slug");
    if (isPost && BOT.test(ua)) {
      const slug = url.searchParams.get("slug");
      const rendered = await fetch(`${API}/post-html?slug=${encodeURIComponent(slug)}`, {
        headers: { "user-agent": ua },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (rendered.ok) {
        return new Response(rendered.body, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
            "x-prerendered": "1",
          },
        });
      }
    }
    return fetch(request); // everyone else: the normal site
  },
};
```

4. **Deploy**.
5. Add the route: Worker → **Settings → Domains & Routes → Add route**
   - Route: `www.gihanmunasinghe.lk/blog/*`
   - Zone: `gihanmunasinghe.lk`

### Verify

Fetch a post as Googlebot and confirm the article text is in the HTML:

```bash
curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  "https://www.gihanmunasinghe.lk/blog/post.html?slug=monolith-to-microservices-lessons" \
  | grep -o "<title>[^<]*" 
```

You should see the real post title (not "Loading…"), and the response should
carry the `x-prerendered: 1` header. A normal browser request should **not**
have that header.

Then in Google Search Console → **URL Inspection** → *Test live URL* → the
rendered HTML should contain the article text.

### If you skip the Worker

Everything still works: Google will render the JS page itself, and share links
already use the server-rendered endpoint so social previews are correct. The
Worker mainly improves crawl reliability and non-Google crawlers.
