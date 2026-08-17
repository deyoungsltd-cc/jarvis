#!/bin/bash
cd "$(dirname "$0")"
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
export PORT="${PORT:-3001}"
export WS_PORT="${WS_PORT:-3002}"
exec bun index.ts
