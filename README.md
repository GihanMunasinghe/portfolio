# portfolio

Personal site + self-contained blog platform for **gihanmunasinghe.lk**.

- **Frontend**: static site (`index.html`, `blog/post.html`, `admin/`),
  hosted on GitHub Pages. Every push to `main` deploys via
  `.github/workflows/deploy.yml`.
- **Backend**: AWS (Lambda + DynamoDB + EventBridge + SES) in `infra/`.
  Runs the blog API, comments, likes, analytics, and the daily AI draft
  agent. See `infra/README.md`.

The site talks to the backend through the API URL in `site-config.json`.
You manage everything from the in-app admin panel — **no GitHub or other
app involved** in day-to-day blogging.

## Managing the blog — https://www.gihanmunasinghe.lk/admin/

Sign in with your admin password. Tabs:

- **Drafts** — AI drafts awaiting approval. Preview, Edit, Publish, Reject.
- **Published** — Edit, Unpublish, enable/disable comments per post, Delete.
- **New post** — write a post by hand (saved as a draft).
- **Comments** — every reader comment; delete any, or reply as yourself.
- **Analytics** — 30-day pageviews, top pages, most-liked posts.

Posts, comments, likes and view counts all live in DynamoDB. Publishing is
instant — no deploy wait.

## Reader features (built in, no sign-in required)

- Native comments with threaded replies (honeypot spam protection)
- Likes (one per browser per post)
- Share to LinkedIn, X, Facebook, WhatsApp, or copy link

## Daily AI drafts

An EventBridge schedule invokes the backend Lambda every morning at 07:00
Singapore time. It pulls today's trending tech stories from free public
sources (Hacker News + dev.to), has **AWS Bedrock** (Claude) analyse them
and pick a hot topic fitting Gihan's expertise, writes a post in his voice
with a generated cover, saves it as a **draft**, and emails a summary via SES. Nothing is
published without approval in the admin panel. Requires Bedrock model access for Anthropic Claude in the account
(submit the one-time Bedrock use-case form in the console).

## Deploying / updating the backend

See `infra/README.md`. In short:

```bash
cd infra
ADMIN_PASSWORD='...' ANTHROPIC_API_KEY='sk-ant-...' \
NOTIFY_EMAIL='gihanmunasinghe266@gmail.com' ./deploy.sh ap-southeast-1
```

The script prints the API URL — put it in `site-config.json` as `"api"`.
