#!/usr/bin/env bash
# HT-505 (Vindhya) — build + sync NexusGear storefront to S3, then invalidate CloudFront.
# Usage:
#   export STOREFRONT_BUCKET=your-bucket
#   export CLOUDFRONT_DISTRIBUTION_ID=E123...
#   ./scripts/deploy-storefront.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/services/ecommerce/dist"

if [[ -z "${STOREFRONT_BUCKET:-}" ]]; then
  echo "STOREFRONT_BUCKET is required"
  exit 1
fi

echo "[deploy] Building storefront..."
cd "$ROOT/services/ecommerce"
npm ci
npm run build

echo "[deploy] Syncing $DIST -> s3://$STOREFRONT_BUCKET"
aws s3 sync "$DIST" "s3://$STOREFRONT_BUCKET" --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

aws s3 cp "$DIST/index.html" "s3://$STOREFRONT_BUCKET/index.html" \
  --cache-control "public,max-age=60" \
  --content-type "text/html"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  echo "[deploy] Invalidating CloudFront distribution $CLOUDFRONT_DISTRIBUTION_ID"
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*"
fi

echo "[deploy] Storefront deploy complete."
