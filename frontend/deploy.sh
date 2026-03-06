#!/usr/bin/env bash
set -euo pipefail

# ── silnik-elektryczny.pl deploy ──
BUCKET="s3://www.silnik-elektryczny.pl"
DIST_ID="EAW287H7GJ9N6"
REGION="eu-north-1"
DIR="dist"

echo "🔨 Building..."
npm run build

echo "📄 Uploading HTML (no-cache)..."
aws s3 sync "$DIR/" "$BUCKET/" \
  --delete \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html" \
  --region "$REGION"

echo "📦 Uploading assets (immutable cache)..."
aws s3 sync "$DIR/" "$BUCKET/" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --region "$REGION"

echo "🔄 Invalidating CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --output text

echo "✅ Done"