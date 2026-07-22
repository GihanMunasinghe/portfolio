# portfolio

Personal portfolio site, deployed to GitHub Pages at https://www.gihanmunasinghe.lk

- Edit `index.html` to update the main page.
- Every push to `main` automatically deploys via GitHub Actions
  (`.github/workflows/deploy.yml`).

## Blog

### Adding a post

1. Copy an existing post in `blog/` to `blog/<your-slug>.html` and edit the
   content. Update the `<title>`, meta description, canonical/OpenGraph tags
   (absolute URLs), header and article body. Images go in `blog/images/`;
   a commented block near the end of each post shows how to embed YouTube
   videos. Keep the `#share` / `#comments` sections and the
   `post-extras.js` include — they power sharing and comments on every post.
2. Add an entry to `blog/posts.json` (newest first) with `slug`, `title`,
   `excerpt`, `date`, `readTime`, `image`, and optional `media` badge text.
3. Push to `main` — the homepage blog grid renders from `posts.json`
   automatically.

### Daily AI drafts (approval via the admin panel)

`.github/workflows/daily-blog-draft.yml` runs Claude every morning at
07:00 Singapore time (23:00 UTC). One-time setup: add a repository secret
(**Settings → Secrets and variables → Actions**) named either
`CLAUDE_CODE_OAUTH_TOKEN` (from running `claude setup-token` locally,
uses your Claude subscription) or `ANTHROPIC_API_KEY` (from
console.anthropic.com). Until a secret exists the workflow skips
harmlessly. Test any time from the Actions tab → "Daily blog draft" →
Run workflow. Each new draft triggers a GitHub issue, which sends you a
push/email notification with a link to the admin panel.

The agent researches current software-engineering topics
and commits a complete draft post directly to `main`:

- the post HTML at `blog/<slug>.html` (rendered and previewable, but
  **not** publicly listed anywhere),
- its cover image in `blog/images/`,
- its metadata entry appended to `drafts/pending.json` (the approval
  queue). The homepage only lists posts from `blog/posts.json`, so
  nothing is visible to visitors until approved.

**Approval happens at https://www.gihanmunasinghe.lk/admin/** — sign in
with a fine-grained GitHub token (repo: portfolio, permission:
Contents read/write; the page explains it). The dashboard shows pending
drafts with Preview / Publish / Reject. Publish moves the entry from
`drafts/pending.json` into `blog/posts.json` (live in ~30s); Reject
removes the entry and deletes the draft file. The agent skips a day if
two or more drafts are already waiting.

### Comments, reactions, sharing & analytics

- Every post has share buttons (LinkedIn, X, Facebook, WhatsApp, copy link)
  rendered by `blog/post-extras.js`.
- Site-wide feature config lives in `site-config.json`, editable from the
  admin panel's **Analytics** tab (no code changes needed).
- **Comments + emoji reactions** use [giscus](https://giscus.app), backed
  by this repo's GitHub Discussions. One-time activation:
  1. Repo **Settings → General → Features** → enable **Discussions**.
  2. Install the [giscus app](https://github.com/apps/giscus) for this repo.
  3. On https://giscus.app select the repo and a category (create "Blog
     comments", type *Announcement*), then paste the category name + ID
     into the admin panel's Analytics tab and press "Activate comments".
  Replies are built into giscus; per-post enable/disable and comment
  deletion/replies are available from the admin panel (token needs
  **Discussions → Read and write**).
- **Traffic analytics** use [GoatCounter](https://www.goatcounter.com)
  (free, privacy-friendly). Create an account, then enter the site code in
  the admin Analytics tab and press "Activate" — pageview tracking starts
  on all pages, and an optional API token shows stats inside the panel.
