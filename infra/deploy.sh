#!/usr/bin/env bash
# Deploy the blog backend. Requires AWS credentials in the environment.
# Usage:
#   ADMIN_PASSWORD='choose-a-strong-password' \
#   ANTHROPIC_API_KEY='sk-ant-...' \
#   NOTIFY_EMAIL='gihanmunasinghe266@gmail.com' \
#   ./deploy.sh [region]
set -euo pipefail
cd "$(dirname "$0")"

REGION="${1:-ap-southeast-1}"
STACK="gihan-blog"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="gihan-blog-code-${ACCOUNT}"

: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
: "${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY}"
: "${NOTIFY_EMAIL:?Set NOTIFY_EMAIL}"

ADMIN_HASH=$(printf '%s' "$ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
AGENT_KEY="${AGENT_KEY:-$(openssl rand -hex 24)}"

echo "==> Packaging lambda"
rm -f lambda.zip
(cd src && zip -q -X ../lambda.zip index.mjs)

echo "==> Uploading code to s3://${BUCKET}"
aws s3 mb "s3://${BUCKET}" --region "$REGION" 2>/dev/null || true
aws s3 cp lambda.zip "s3://${BUCKET}/lambda.zip" --region "$REGION"

echo "==> Deploying CloudFormation stack ${STACK}"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    CodeBucket="$BUCKET" CodeKey=lambda.zip \
    AdminPasswordHash="$ADMIN_HASH" \
    JwtSecret="$JWT_SECRET" \
    AgentKey="$AGENT_KEY" \
    AnthropicApiKey="$ANTHROPIC_API_KEY" \
    NotifyEmail="$NOTIFY_EMAIL"

echo "==> Forcing lambda code refresh"
aws lambda update-function-code --region "$REGION" \
  --function-name gihan-blog-api \
  --s3-bucket "$BUCKET" --s3-key lambda.zip >/dev/null

echo "==> Verifying SES identity (morning notification emails)"
aws sesv2 create-email-identity --region "$REGION" --email-identity "$NOTIFY_EMAIL" 2>/dev/null \
  && echo "    Verification email sent to $NOTIFY_EMAIL — click the link in it once." \
  || echo "    SES identity already exists."

API_URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)

echo
echo "================================================================"
echo "API URL: ${API_URL}"
echo "Paste this into site-config.json as \"api\" (without trailing slash)."
echo "================================================================"
