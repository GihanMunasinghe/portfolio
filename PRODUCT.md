# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A balanced personal-brand audience, with no single group leading:

- **Prospective consulting clients**: founders, teams and businesses who need architecture, backend delivery, or cloud and operations help, and want to judge whether Gihan is the engineer to trust with it.
- **Learners**: students, career-switchers and junior developers looking for 1-on-1 mentoring or small-group classes in Java, Spring, microservices and the cloud.
- **Investors, partners and pilot customers**: people evaluating the products and MVPs on the Ventures page and deciding whether to request a meeting.
- **Readers**: engineers arriving from search or social on a blog post, sometimes reading in Chinese, Malay, Tamil, Sinhala or Hindi through the built-in translation.
- **Shop buyers**: people browsing pre-loved tech books and gaming subscriptions, ordering over WhatsApp or (when enabled) paying by card.

## Product Purpose

The official site of Gihan Munasinghe, a Singapore-based software engineer, consultant and educator. It introduces him, shows the work he builds, offers consulting and coaching, publishes a tech blog, lists his ventures, and runs a small shop. Success is a visitor who understands within seconds who Gihan is and what he offers, then takes the next step: emails or WhatsApps him, reads a post, opens a venture, requests a meeting, or orders from the shop.

## Positioning

One practising engineer across three roles: he **builds** (his own products and clients' systems), **consults** (architecture, delivery, cloud), and **teaches** (1-on-1 and small groups). The teaching and consulting come from current production work in banking-grade systems, not from recorded courses or an agency bench.

## Operating Context

- Static site on GitHub Pages at `www.gihanmunasinghe.lk`; every push to `main` deploys the whole repository root. No build step.
- Live data comes from the AWS backend at `https://api.gihanmunasinghe.lk` (URL in `site-config.json`): published posts, post HTML, comments, likes, translations, ventures, products, shop config, checkout, meeting requests and pageview tracking.
- Content is managed in the in-app admin panel (`/admin/`), including AI-drafted posts that Gihan approves.
- Share links go through server-rendered API endpoints (`/share`, `/share-post`) so social previews work.

## Capabilities and Constraints

- Pages: homepage (`index.html`), Ventures (`ventures.html`, deep link `?app=<id>`), Shop (`shop.html`, deep link `?product=<id>`, Stripe `?success` / `?canceled` banners), blog post template (`blog/post.html?slug=<slug>`), legacy post redirects in `blog/*.html`, `404.html`, and the private admin panel.
- Homepage anchors in use: `#top`, `#blog`, `#services`, `#teaching`, `#expertise`, `#about`, `#contact`. URLs, slugs and query parameters must stay stable.
- Content Security Policy is set per page in a meta tag: scripts and styles from `'self'` plus inline, fonts and styles from Google Fonts, images from `'self'`, `data:` and the shop S3 bucket, frames from YouTube and Vimeo, connections to the API.
- Blog posts and ventures may carry a server-generated inline SVG cover (`coverSvg`) drawn in the previous dark navy and blue-violet palette; pages must present those covers well until the generator changes.
- SEO is a durable investment: titles, descriptions, canonical URLs, Open Graph and Twitter tags, and the Person / ProfilePage / WebSite / ProfessionalService JSON-LD must be preserved.
- Reader features: threaded comments with a honeypot field, one like per browser, share to LinkedIn, X, Facebook and WhatsApp, copy link, and per-reader translation with a remembered language.

## Brand Commitments

- Name and domain: Gihan Munasinghe, gihanmunasinghe.lk. Wordmark "Gihan." and the "G" favicon.
- Voice: first person, warm, plain and practical ("If you're building something, or want to learn how, I'd love to hear from you").
- Contact routes: email `gihanmunasinghe266@gmail.com`, WhatsApp `+65 8646 9798`, LinkedIn, GitHub, Instagram, YouTube, Facebook.

## Evidence on Hand

- Photos in `assets/`: `gihan-formal.jpg` (900x900 portrait), `gihan-casual.jpg` (1000x1000), `gihan-headshot.jpg` (900x1350), `gihan-cartoon.jpg` (700x1050 illustration of Gihan coding with coffee).
- Blog cover images in `blog/images/`.
- Work history, confirmed by Gihan for display (restored from his CV):
  - Feb 2024 to present, Singapore: Manager, Group Engineering, OCBC. Leading legacy-to-microservices migration design and delivery, defining engineering governance (APIs, security, observability, CI/CD) adopted across teams, and architecting a containerized multi-channel client platform.
  - Oct 2022 to Feb 2024, Singapore: Senior Software Engineer, Percept Solutions (banking and treasury). Treasury static data systems for banking clients: Java/Spring services with Kafka and Pub/Sub messaging, hardened for data integrity, security and regulatory compliance.
  - Jul 2019 to Oct 2022, Malaysia and Sri Lanka: Technical Lead / Senior Software Engineer, Axiata Digital Labs (Celcom Life). Scalable microservices backends for a national telco's self-care app (authentication, billing, customer profile services) and triage of critical production incidents.
  - Sep 2021 to Oct 2022, Sri Lanka: Senior Software Engineer, Aeturnum (e-commerce). Backend services and partner integrations, improving order-processing reliability and scalability.
  - Jul 2017 to Jul 2019, Sri Lanka: Software Engineer, Virtusa. Developer tooling and automation integrating security scanning (Veracode) into CI pipelines.
- Live content from the API: blog posts, ventures (including Band Arranger and Atteo), shop products.
- **Absent, never to be fabricated**: testimonials, client logos, client names beyond the employers above, student counts, project metrics, ratings, prices outside the shop data.

## Product Principles

1. Lead with the person, then the three roles in balance: build, consult, teach.
2. Prove with real work: posts, ventures, history and photos, never invented social proof.
3. Every visitor has one obvious next step, and contact is never more than one tap away.
4. Live API content must look intentional in every state: loading, empty, error and full.
5. Keep what the site has earned: URLs, SEO, structured data and reader features.

## Accessibility & Inclusion

WCAG 2.1 AA contrast and keyboard access across all pages; honour `prefers-reduced-motion`. Blog content is read in non-Latin scripts (Chinese, Tamil, Sinhala, Devanagari), so type and line-height must render those scripts well.
