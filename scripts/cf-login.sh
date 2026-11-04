#!/bin/bash
# Run wrangler login and open the OAuth URL in Chrome as soon as it exists.
# The bundled CLI's 120s login timeout is patched to 10 min (see README).
set -u
LOG=/tmp/wrangler-login.log
rm -f "$LOG"

cd "$(dirname "$0")/.." || exit 1
./node_modules/.bin/wrangler login > "$LOG" 2>&1 &
WPID=$!

URL=""
for _ in $(seq 1 60); do
  URL=$(grep -o 'https://dash.cloudflare.com/oauth2/auth[^ ]*' "$LOG" 2>/dev/null | head -1)
  if [ -n "$URL" ]; then
    echo "opening browser: ${URL:0:90}..."
    open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
    break
  fi
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "no OAuth URL appeared; wrangler output:"
  cat "$LOG"
  kill $WPID 2>/dev/null
  exit 1
fi

wait $WPID
STATUS=$?
echo "wrangler login exited with status $STATUS"
tail -15 "$LOG"
exit $STATUS
