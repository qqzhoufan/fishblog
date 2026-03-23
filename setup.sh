#!/usr/bin/env bash
set -euo pipefail

# FishBlog one-click setup script
# Prerequisites: npm, wrangler (npx wrangler login first)

echo "🐟 FishBlog Setup"
echo "================="

if [ ! -f wrangler.toml ]; then
  cp wrangler.toml.example wrangler.toml
  echo "Created wrangler.toml from template."
fi

read -rp "Enter admin username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -rsp "Enter admin password: " ADMIN_PASS
echo

PASS_HASH=$(echo -n "$ADMIN_PASS" | sha256sum | awk '{print $1}')
echo "Password hash: $PASS_HASH"

echo ""
echo "Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create fishblog-db 2>&1) || true
echo "$DB_OUTPUT"

DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+' || true)

if [ -n "$DB_ID" ]; then
  echo "Updating wrangler.toml with database_id: $DB_ID"
  sed -i "s/placeholder-replace-after-creation/$DB_ID/" wrangler.toml
else
  echo "⚠ Could not extract database_id. Please update wrangler.toml manually."
fi

echo "Updating admin credentials in wrangler.toml..."
sed -i "s/ADMIN_USERNAME = \"admin\"/ADMIN_USERNAME = \"$ADMIN_USER\"/" wrangler.toml
sed -i "s/ADMIN_PASSWORD_HASH = \"\"/ADMIN_PASSWORD_HASH = \"$PASS_HASH\"/" wrangler.toml

echo ""
echo "Applying database schema..."
npx wrangler d1 execute fishblog-db --local --file=src/db/schema.sql

echo ""
echo "✅ Setup complete!"
echo ""
echo "Local development:  npm run dev"
echo "Deploy to CF:       npm run deploy"
echo ""
echo "Don't forget to set these GitHub Secrets for CI/CD:"
echo "  CF_API_TOKEN    - Cloudflare API Token (Workers + D1 permissions)"
echo "  CF_ACCOUNT_ID   - Your Cloudflare Account ID"
