# Getting found on Google for "Gihan Munasinghe"

The site is technically ready (meta, canonicals, structured data, sitemaps,
IndexNow). What's left are the steps that need *your* accounts. Do #1 and #2 —
they're ~80% of the outcome.

**Context:** there is another, well-established Gihan Munasinghe (a CTO in
Edinburgh with press coverage). Ranking for your own name against him is very
doable — you own the exact-match domain — but it's earned over weeks, not
overnight. Nobody can honestly promise instant top-3 for a contested name.

---

## 1. Google Search Console — the single most important step

Until Google indexes the site, it cannot rank at any position.

1. Go to <https://search.google.com/search-console> and sign in.
2. **Add property → Domain** → enter `gihanmunasinghe.lk`.
3. It shows a **TXT record**. Add it in Cloudflare:
   - DNS → Add record → Type **TXT**, Name **@**, Content = the
     `google-site-verification=…` value it gives you → Save.
   - *(Prefer the HTML-tag method instead? Choose "URL prefix" →
     `https://www.gihanmunasinghe.lk` → HTML tag, and send me the tag — I'll
     add it to the site.)*
4. Back in Search Console, click **Verify**.
5. **Sitemaps** (left menu) → submit: `sitemap.xml`
6. **URL Inspection** (top search bar) → paste `https://www.gihanmunasinghe.lk/`
   → **Request Indexing**. Repeat for 2–3 blog post URLs.

Expect indexing in **days**. Check progress by searching `site:gihanmunasinghe.lk`.

## 2. Point your real profiles at the site (authority + identity)

Google currently has no links telling it "this site belongs to this person."
Your site already declares the profiles; the links must go **both ways**.

Add `https://www.gihanmunasinghe.lk` to:

- [ ] **LinkedIn** → Edit profile → Contact info → Website
- [ ] **GitHub** → Profile settings → Website  *(also pin a repo linking it)*
- [ ] **Instagram** → Edit profile → Link in bio
- [ ] **YouTube** → Channel customisation → Links
- [ ] **Facebook** → About → Website
- [ ] Any conference talk, meetup, guest post, or course bio you have

This is the highest-leverage non-technical work: these are the backlinks and
identity signals that build a personal-brand entity (and eventually a Knowledge
Panel).

## 3. Bing Webmaster Tools (covers Bing, DuckDuckGo, and AI search)

1. <https://www.bing.com/webmasters> → sign in.
2. **Import from Google Search Console** (fastest) or verify with the same DNS TXT method.
3. Submit `https://www.gihanmunasinghe.lk/sitemap.xml`.

*(IndexNow already pings Bing/Yandex automatically whenever you publish — see below.)*

## 4. Cloudflare edge security headers

Not an SEO ranking factor directly, but HTTPS/security hygiene is a quality
signal and protects the site. Steps are in **`docs/cloudflare-security.md`**.

## 5. Keep publishing

Each published post is a new indexable page that mentions your name and
expertise. Your daily AI draft agent already queues these — just review and
publish. Consistency compounds; this is what wins the name over time.

---

## What's already automated for you

- **`sitemap.xml`** (static) + **`https://api.gihanmunasinghe.lk/sitemap.xml`**
  (dynamic — always lists every published post and visible product).
- **`robots.txt`** allows crawlers, blocks `/admin/`, points to both sitemaps.
- **IndexNow**: publishing a post or adding a product instantly notifies
  Bing/DuckDuckGo/Yandex. Key file: `/f9d45a96a87d03dae7ad4ef3bb3677f1.txt`.
- **Structured data**: `Person` + `ProfilePage` + `WebSite` +
  `ProfessionalService` on the homepage, `BlogPosting` per post, `CollectionPage`
  on the shop.
- **Per-page** titles, descriptions, canonicals, Open Graph + Twitter cards.

## Realistic timeline

| When | What to expect |
|------|----------------|
| Days | Indexed; site appears for `site:gihanmunasinghe.lk` and exact queries like "gihanmunasinghe.lk" |
| 2–6 weeks | Appears for "Gihan Munasinghe" — position depends on profile links |
| 1–3 months | Competitive for page 1 / top 3, given steady posting + profile backlinks |
