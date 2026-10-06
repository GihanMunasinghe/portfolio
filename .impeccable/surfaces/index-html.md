---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["ventures.html","shop.html","blog/post.html","404.html"]
---

# Surface brief: public site (homepage lead; ventures, shop, blog post, 404)

Scope: index.html is the lead surface; ventures.html, shop.html, blog/post.html and 404.html share its system. Visitor mode: Persuade (homepage, ventures), Read (blog post), Operate-light (shop). Admin panel out of scope.

Audience and job: balanced personal brand. Clients, learners, investors, readers and buyers must grasp who Gihan is and take one next step (email, WhatsApp, read, request a meeting, order). Proof: real photos, live posts/ventures/products, the CV timeline. Nothing invented.

Constraints: keep URLs, anchors, query params, SEO meta and JSON-LD, CSP, every API-driven feature and the behaviour of each page script.

History: the "paperback series" direction (seed e48aeb2b, degraded roll) shipped and was rejected by the user (too retro and bookish, too many colours, light by default, wrong type). The user then took the standing exit: the category standard, played straight, benchmarked against Vercel and Lee Robinson. Accent colour was delegated.

## Direction contract

THESIS: A modern minimal engineer's site, executed at Vercel/Lee Robinson craft: near-monochrome dark, one restrained azure accent, crisp Geist type, generous space. It refuses concept costumes, colour noise and decorative chrome; quality shows in spacing, type and states.

OWN-WORLD: Near-black ground (#0a0a0a) with graphite surfaces and 1px hairline borders, light grey type in three steps, a single azure accent for links, focus and small highlights, Geist and Geist Mono (code and data only), 6px controls and 12px containers, Phosphor icons, monochrome Simple Icons for the tool stack. Light theme is a toggle, not the default.

STORY: The visitor meets Gihan's face and name with a two-tone headline, reads one line of what he does, then scans writing, ventures, consulting, teaching, expertise and his career, and ends at a clear contact block.

FIRST VIEWPORT: Slim sticky header (wordmark left, six links, theme toggle, "Work with me"). Left: two-tone H1 "Gihan Munasinghe. Software engineer, consultant & educator." at about 4rem, an 18-word pitch, "Email me" (light filled) and "WhatsApp" (outlined). Right: the headshot in a 4:5, 12px-radius frame. Primary action: Email me.

FORM: Category standard by user choice (standing exit), references Vercel and leerob.com; no seed roll for this round. Signature interaction: a calm load sequence (hero lines resolve from a slight blur and offset, once) and precise hover states; the writing list expands in place to show every post.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
