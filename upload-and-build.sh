#!/usr/bin/env bash
set -euo pipefail

# ── Upload source + trigger rebuild ──
# Uruchamiaj z katalogu d:\silnik-elektryczny.pl

REGION="eu-north-1"
SOURCE_BUCKET="silnik-elektryczny-pl-source"

echo "📦 Packing source..."
zip -r source.zip \
  frontend/src/ \
  frontend/public/ \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/astro.config.mjs \
  frontend/tsconfig.json \
  frontend/tailwind.config.mjs \
  buildspec.yml \
  -x "frontend/node_modules/*" "frontend/dist/*" "frontend/.astro/*"

echo "☁️  Uploading to S3..."
aws s3 cp source.zip "s3://${SOURCE_BUCKET}/source.zip" --region "$REGION"

echo "🔨 Starting build..."
aws codebuild start-build \
  --project-name silnik-elektryczny-pl \
  --region "$REGION" \
  --output text \
  --query 'build.id'

rm source.zip
echo "✅ Build triggered"