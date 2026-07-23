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

## Shop (pre-loved marketplace)

Products, orders and shop settings live in DynamoDB (managed from the admin
Shop/Orders tabs). Product photos upload to a public-read S3 bucket via
presigned PUT URLs. Checkout uses **Stripe Checkout** (hosted), which
enables **Apple Pay, Google Pay and cards** with no card data touching the
site.

One-time setup (already applied to the live stack; here for reproducibility):

```bash
BUCKET=gihan-shop-media-$ACCOUNT
aws s3api create-bucket --bucket $BUCKET --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $BUCKET --policy \
  '{"Version":"2012-10-17","Statement":[{"Sid":"PublicRead","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::'$BUCKET'/*"}]}'
aws s3api put-bucket-cors --bucket $BUCKET --cors-configuration \
  '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]}'
# Lambda env: MEDIA_BUCKET, MEDIA_BASE=https://$BUCKET.s3.ap-southeast-1.amazonaws.com
```

### Enabling checkout (Stripe)

1. Create a Stripe account (Singapore) and get the **secret key** (`sk_...`).
2. In Stripe Dashboard, enable Apple Pay & Google Pay (Settings → Payment methods).
3. Add a webhook endpoint → `https://<api>/stripe-webhook`, event
   `checkout.session.completed`; copy its **signing secret** (`whsec_...`).
4. Set Lambda env `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Checkout
   goes live immediately (the storefront reads `checkout: true` from
   `/shop-config`).

Because checkout happens on Stripe's hosted page, Apple Pay works without
hosting a domain-association file on this site.
