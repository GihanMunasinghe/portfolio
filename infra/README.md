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
