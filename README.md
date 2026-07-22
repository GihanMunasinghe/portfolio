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

### Daily AI drafts (approval workflow)

A scheduled Claude agent researches current software-engineering topics
every morning and opens a pull request titled `Daily blog draft: …` with a
complete post following the conventions above. Nothing publishes without
approval: **merging the PR is the approval** and triggers deployment.
Close the PR to reject a draft. Review checklist: read the post, check the
sources it cites, adjust voice/details as needed (PRs are editable before
merging).

### Comments, reactions & sharing

- Every post has share buttons (LinkedIn, X, Facebook, WhatsApp, copy link)
  rendered by `blog/post-extras.js`.
- Comments + emoji reactions use [giscus](https://giscus.app), backed by
  this repo's GitHub Discussions. One-time activation:
  1. Repo **Settings → General → Features** → enable **Discussions**.
  2. Install the [giscus app](https://github.com/apps/giscus) for this repo.
  3. On https://giscus.app enter the repo, pick a discussion category
     (create one named "Blog comments", type *Announcement*), and copy the
     `data-category` and `data-category-id` values into the `GISCUS` config
     at the top of `blog/post-extras.js`.
