#!/bin/sh
set -eu
freshclam --stdout || true
clamd --config-file=/etc/clamav/clamd.conf || true
node /app/worker/wait-clamd.mjs
(
  while true; do
    sleep 14400
    freshclam --stdout || true
  done
) &
cd /app
exec npx tsx src/worker/index.ts
