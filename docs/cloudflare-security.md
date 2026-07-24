# Cloudflare edge security headers — setup guide

The site (GitHub Pages) can't send custom HTTP headers on its own, so we add
them at Cloudflare's edge. This is a one-time setup in the Cloudflare dashboard
for the `gihanmunasinghe.lk` zone. In-page `<meta>` CSP is already shipped in
the HTML; these edge headers add HSTS, real clickjacking protection, and a
server-enforced CSP on top (defense in depth).

> The API stays on its own path: **leave the `api` record DNS-only (grey cloud)**.
> Proxying `api` would break the API Gateway TLS certificate.

---

## 1. Proxy the site records (not the API)

**DNS → Records:**

| Record | Type | Content | Proxy |
|--------|------|---------|-------|
| `www` | CNAME | `gihanmunasinghe.github.io` | **Proxied (orange)** |
| `@` (apex) | A/CNAME → GitHub Pages | (existing) | **Proxied (orange)** |
| `api` | CNAME | `d-nrbcz64j0f.execute-api.ap-southeast-1.amazonaws.com` | **DNS only (grey)** — do NOT change |

## 2. TLS settings

- **SSL/TLS → Overview → Full (strict)**
- **SSL/TLS → Edge Certificates:**
  - **Always Use HTTPS:** On
  - **Automatic HTTPS Rewrites:** On
  - **Minimum TLS Version:** TLS 1.2
  - **HTTP Strict Transport Security (HSTS):** Enable →
    - Max-Age: **12 months**
    - **Include subdomains:** On (safe — `api` is HTTPS too)
    - Preload: optional (only enable if you intend to stay HTTPS-only long-term)

## 3. Response security headers

**Rules → Transform Rules → Modify Response Header → Create rule.**
Rule name: `security-headers`. When: *All incoming requests*. Then **Set static** for each:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()` |
| `Content-Security-Policy` | *(the one line below)* |

**Content-Security-Policy value** (superset that covers every page including the admin editor):

```
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://gihan-shop-media-303963685758.s3.ap-southeast-1.amazonaws.com; connect-src 'self' https://api.gihanmunasinghe.lk https://gihan-shop-media-303963685758.s3.ap-southeast-1.amazonaws.com; frame-src https://www.youtube.com https://player.vimeo.com
```

`frame-ancestors 'none'` here is what actually blocks your site from being framed
(clickjacking) — it only works as a real header, which is why the edge rule matters.

## 4. Verify

After it propagates (a minute or two), check headers:

```bash
curl -sI https://www.gihanmunasinghe.lk/ | grep -iE 'strict-transport|x-frame|content-security|x-content-type|referrer|permissions-policy'
```

Or paste the URL into https://securityheaders.com — aim for an **A/A+**.

---

## Notes / trade-offs

- **`'unsafe-inline'` in `script-src`** is required because every page uses inline
  `<script>`/`<style>` and GitHub Pages can't inject per-request nonces. The CSP
  still restricts *where* scripts, data, images, and frames may come from, which
  is the bulk of the value.
- The API (Lambda) already sends `X-Content-Type-Options: nosniff` and
  `Referrer-Policy` on its responses, has CORS locked to `www`/apex
  `gihanmunasinghe.lk`, and is rate-limited (40 burst / 20 rps) at API Gateway.
