# Blog platform backend (AWS)

Native backend for the blog: admin auth, posts, comments, likes, analytics,
and the daily AI draft agent — Lambda + DynamoDB + EventBridge + SES.

## Deploy

Requires AWS credentials with rights to create the stack (CloudFormation,
Lambda, DynamoDB, IAM role, EventBridge, S3, SES).

```bash
ADMIN_PASSWORD='choose-a-strong-password' \
ANTHROPIC_API_KEY='sk-ant-...' \
NOTIFY_EMAIL='gihanmunasinghe266@gmail.com' \
./deploy.sh ap-southeast-1
```

Then:
1. Click the verification link SES emails to NOTIFY_EMAIL (one time).
2. Paste the printed API URL into `site-config.json` as `"api"`.

## Pieces

- `src/index.mjs` — the entire API + scheduled daily-draft job
- `template.yaml` — CloudFormation stack (table `gihan-blog`, function
  `gihan-blog-api` with a public Function URL, daily 23:00 UTC rule)
- Costs: DynamoDB on-demand + Lambda free tier ≈ $0–2/month; daily drafts
  use the Anthropic API key (~cents per draft with web search).

## Public entry: API Gateway (not Function URL)

This account blocks public Lambda **Function URLs** at the org level (they
return 403 to browsers), so the public entry is an **HTTP API Gateway** in
front of the same Lambda (payload format 2.0 — the handler already uses that
event shape, so no code change). The template provisions it; a fresh
`deploy.sh` prints the API URL to put in `site-config.json`.

The current live endpoint was created via CLI while debugging and is what
`site-config.json` points to. A full `cloudformation deploy` would create an
equivalent managed API (new URL) — update `site-config.json` with the value
the script prints if you redeploy.
