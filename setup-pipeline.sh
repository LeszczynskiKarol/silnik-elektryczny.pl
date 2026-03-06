#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════╗
# ║  Auto-rebuild pipeline for silnik-elektryczny.pl         ║
# ║                                                          ║
# ║  1. CodeBuild project (builds Astro + deploys to S3)     ║
# ║  2. Lambda trigger (starts CodeBuild, with debounce)     ║
# ║  3. API Gateway endpoint (webhook URL for backend)       ║
# ║  4. EventBridge cron (rebuild every 30 min as fallback)  ║
# ╚══════════════════════════════════════════════════════════╝

REGION="eu-north-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PROJECT_NAME="silnik-elektryczny-pl"
LAMBDA_NAME="silnik-elektryczny-rebuild"
REPO_URL=""  # Zostaw puste jeśli nie używasz repo — użyjemy S3 source

# Webhook secret (zmień na coś losowego!)
WEBHOOK_SECRET="ZMIEN-NA-LOSOWY-SECRET-$(openssl rand -hex 16)"

echo "Account: $ACCOUNT_ID"
echo "Region:  $REGION"
echo "Webhook secret: $WEBHOOK_SECRET"
echo ""

# ────────────────────────────────────────
# KROK 1: IAM Role dla CodeBuild
# ────────────────────────────────────────
echo "1/6 Creating CodeBuild IAM role..."

CODEBUILD_ROLE="${PROJECT_NAME}-codebuild-role"

aws iam create-role \
  --role-name "$CODEBUILD_ROLE" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "codebuild.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }' \
  --region "$REGION" 2>/dev/null || echo "  Role already exists"

aws iam put-role-policy \
  --role-name "$CODEBUILD_ROLE" \
  --policy-name "${PROJECT_NAME}-codebuild-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:ListBucket","s3:GetBucketLocation"],
        "Resource": ["arn:aws:s3:::www.silnik-elektryczny.pl","arn:aws:s3:::www.silnik-elektryczny.pl/*","arn:aws:s3:::'"$PROJECT_NAME"'-source","arn:aws:s3:::'"$PROJECT_NAME"'-source/*"]
      },
      {
        "Effect": "Allow",
        "Action": ["cloudfront:CreateInvalidation"],
        "Resource": "arn:aws:cloudfront::'"$ACCOUNT_ID"':distribution/EAW287H7GJ9N6"
      },
      {
        "Effect": "Allow",
        "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
        "Resource": "arn:aws:logs:'"$REGION"':'"$ACCOUNT_ID"':log-group:/aws/codebuild/*"
      }
    ]
  }'

echo "  Waiting for role propagation..."
sleep 10

# ────────────────────────────────────────
# KROK 2: S3 bucket na source code
# ────────────────────────────────────────
echo "2/6 Creating source S3 bucket..."

SOURCE_BUCKET="${PROJECT_NAME}-source"
aws s3 mb "s3://${SOURCE_BUCKET}" --region "$REGION" 2>/dev/null || echo "  Bucket already exists"

# ────────────────────────────────────────
# KROK 3: CodeBuild project
# ────────────────────────────────────────
echo "3/6 Creating CodeBuild project..."

aws codebuild create-project \
  --name "$PROJECT_NAME" \
  --source '{
    "type": "S3",
    "location": "'"$SOURCE_BUCKET"'/source.zip"
  }' \
  --artifacts '{"type": "NO_ARTIFACTS"}' \
  --environment '{
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
    "computeType": "BUILD_GENERAL1_SMALL"
  }' \
  --service-role "arn:aws:iam::${ACCOUNT_ID}:role/${CODEBUILD_ROLE}" \
  --region "$REGION" \
  --cache '{"type": "LOCAL", "modes": ["LOCAL_CUSTOM_CACHE"]}' \
  --build-timeout-in-minutes 10 \
  --output text 2>/dev/null || echo "  Project already exists"

# ────────────────────────────────────────
# KROK 4: Lambda trigger
# ────────────────────────────────────────
echo "4/6 Creating Lambda trigger..."

LAMBDA_ROLE="${PROJECT_NAME}-lambda-role"

aws iam create-role \
  --role-name "$LAMBDA_ROLE" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }' \
  --region "$REGION" 2>/dev/null || echo "  Role already exists"

aws iam put-role-policy \
  --role-name "$LAMBDA_ROLE" \
  --policy-name "${PROJECT_NAME}-lambda-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["codebuild:StartBuild","codebuild:BatchGetBuilds","codebuild:ListBuildsForProject"],
        "Resource": "arn:aws:codebuild:'"$REGION"':'"$ACCOUNT_ID"':project/'"$PROJECT_NAME"'"
      },
      {
        "Effect": "Allow",
        "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
        "Resource": "arn:aws:logs:'"$REGION"':'"$ACCOUNT_ID"':*"
      }
    ]
  }'

sleep 10

# Pakuj Lambda
cd /tmp
cp "$OLDPWD/../rebuild/index.mjs" . 2>/dev/null || true
zip -j rebuild-trigger.zip index.mjs

aws lambda create-function \
  --function-name "$LAMBDA_NAME" \
  --runtime nodejs20.x \
  --handler index.handler \
  --role "arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}" \
  --zip-file fileb://rebuild-trigger.zip \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={WEBHOOK_SECRET=${WEBHOOK_SECRET}}" \
  --region "$REGION" 2>/dev/null || {
    echo "  Function exists, updating..."
    aws lambda update-function-code \
      --function-name "$LAMBDA_NAME" \
      --zip-file fileb://rebuild-trigger.zip \
      --region "$REGION"
    aws lambda update-function-configuration \
      --function-name "$LAMBDA_NAME" \
      --environment "Variables={WEBHOOK_SECRET=${WEBHOOK_SECRET}}" \
      --region "$REGION"
  }

# Function URL (zamiast API Gateway — prostsze)
FUNC_URL=$(aws lambda create-function-url-config \
  --function-name "$LAMBDA_NAME" \
  --auth-type NONE \
  --cors '{"AllowOrigins":["*"],"AllowHeaders":["*"],"AllowMethods":["POST","OPTIONS"]}' \
  --region "$REGION" \
  --query 'FunctionUrl' --output text 2>/dev/null || \
  aws lambda get-function-url-config \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --query 'FunctionUrl' --output text)

# Publiczny dostęp do Function URL
aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id "FunctionURLPublicAccess" \
  --action "lambda:InvokeFunctionUrl" \
  --principal "*" \
  --function-url-auth-type NONE \
  --region "$REGION" 2>/dev/null || true

# ────────────────────────────────────────
# KROK 5: EventBridge cron (co 30 min)
# ────────────────────────────────────────
echo "5/6 Creating EventBridge cron rule..."

RULE_NAME="${PROJECT_NAME}-rebuild-cron"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"

aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "rate(30 minutes)" \
  --state ENABLED \
  --description "Rebuild silnik-elektryczny.pl co 30 min" \
  --region "$REGION"

aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id "EventBridgeCron" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
  --region "$REGION" 2>/dev/null || true

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=rebuild-lambda,Arn=${LAMBDA_ARN}" \
  --region "$REGION"

# ────────────────────────────────────────
# KROK 6: Pierwsze uploadowanie source
# ────────────────────────────────────────
echo "6/6 Upload source code..."
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SETUP COMPLETE!                                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Webhook URL:    ${FUNC_URL}"
echo "Webhook secret: ${WEBHOOK_SECRET}"
echo ""
echo "NASTĘPNE KROKI:"
echo ""
echo "1. Upload source code (uruchom z katalogu silnik-elektryczny.pl):"
echo "   cd d:\\silnik-elektryczny.pl"
echo "   zip -r source.zip frontend/ lambda/ buildspec.yml -x 'frontend/node_modules/*' 'frontend/dist/*' 'frontend/.astro/*'"
echo "   aws s3 cp source.zip s3://${SOURCE_BUCKET}/source.zip --region ${REGION}"
echo ""
echo "2. Dodaj webhook w backendzie Stojan (po zamówieniu/zmianie stocku):"
echo "   POST ${FUNC_URL}"
echo "   Header: X-Webhook-Secret: ${WEBHOOK_SECRET}"
echo "   Body:   {\"reason\": \"stock_change\", \"productSlug\": \"...\"}"
echo ""
echo "3. Przetestuj ręcznie:"
echo "   curl -X POST ${FUNC_URL} -H 'X-Webhook-Secret: ${WEBHOOK_SECRET}' -H 'Content-Type: application/json' -d '{\"reason\":\"manual_test\"}'"
echo ""
echo "4. Zapisz WEBHOOK_SECRET w bezpiecznym miejscu!"