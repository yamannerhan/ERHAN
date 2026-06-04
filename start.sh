#!/bin/sh
set -e

pnpm --filter @workspace/db exec drizzle-kit push --config ./drizzle.config.ts
# pnpm exec tsx scripts/seed-admin.ts
exec node artifacts/api-server/dist/index.mjs