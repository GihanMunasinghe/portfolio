# portfolio

Personal portfolio site, deployed to GitHub Pages at https://www.gihanmunasinghe.lk

- Edit `index.html` to update the main page.
- Every push to `main` automatically deploys via GitHub Actions
  (`.github/workflows/deploy.yml`).

## Adding a blog post

1. Copy an existing post in `blog/` (e.g.
   `launching-my-portfolio-github-pages.html`) to `blog/<your-slug>.html`
   and edit the content. Images go in `blog/images/`; a commented block at
   the bottom of the template shows how to embed YouTube videos.
2. Add an entry to `blog/posts.json` (newest first) with `slug`, `title`,
   `excerpt`, `date`, `readTime`, `image`, and optional `media` badge text.
3. Push to `main` — the homepage blog grid renders from `posts.json`
   automatically.
