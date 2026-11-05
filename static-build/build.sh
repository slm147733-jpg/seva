#!/usr/bin/env bash
# Builds the plain static Hostinger copy (no server, no Supabase): saved logins in seed.json, data per browser.
set -e
OUT=/tmp/hostinger-static
cd /app/frontend
VITE_LOCAL_MODE=1 npx vite build --outDir "$OUT" --emptyOutDir
rm -f "$OUT"/*.zip "$OUT"/supabase-schema.sql
python /app/backend/scripts/export_static_seed.py "$OUT/seed.json"
rm -f /app/frontend/public/sevakendra-hostinger-static.zip
(cd "$OUT" && zip -qr /app/frontend/public/sevakendra-hostinger-static.zip .)
ls -la /app/frontend/public/sevakendra-hostinger-static.zip
