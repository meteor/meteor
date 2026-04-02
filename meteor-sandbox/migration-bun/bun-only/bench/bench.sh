#!/usr/bin/env bash
# bench.sh — Benchmark a running Meteor server
#
# Usage:
#   ./bench.sh <label> <port>
#
# Expects the server to already be running on <port>.
# Outputs results to stdout in a parseable format.

set -e

LABEL="$1"
PORT="$2"
URL="http://localhost:${PORT}"
WS_URL="ws://localhost:${PORT}/websocket"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$LABEL" ] || [ -z "$PORT" ]; then
  echo "Usage: $0 <label> <port>"
  exit 1
fi

echo "================================================================"
echo "Benchmark: ${LABEL} (port ${PORT})"
echo "================================================================"

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '' "${URL}/" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

echo ""
echo "--- HTTP: Boilerplate HTML (/) ---"
ab -n 2000 -c 10 -q "${URL}/" 2>&1 | grep -E 'Requests per second|Time per request.*\(mean\)|Transfer rate|Failed requests'

echo ""
echo "--- HTTP: Static JS asset ---"
JS_URL=$(curl -s "${URL}/" | grep -oP 'src="[^"]*\.js[^"]*"' | head -1 | tr -d '"' | sed 's/src=//')
if [ -n "$JS_URL" ]; then
  echo "Asset: ${JS_URL}"
  ab -n 2000 -c 10 -q "${URL}${JS_URL}" 2>&1 | grep -E 'Requests per second|Time per request.*\(mean\)|Transfer rate|Failed requests'
else
  echo "(no JS asset found, skipping)"
fi

echo ""
echo "--- HTTP: Static CSS asset ---"
CSS_URL=$(curl -s "${URL}/" | grep -oP 'href="[^"]*\.css[^"]*"' | head -1 | tr -d '"' | sed 's/href=//')
if [ -n "$CSS_URL" ]; then
  echo "Asset: ${CSS_URL}"
  ab -n 2000 -c 10 -q "${URL}${CSS_URL}" 2>&1 | grep -E 'Requests per second|Time per request.*\(mean\)|Transfer rate|Failed requests'
else
  echo "(no CSS asset found, skipping)"
fi

echo ""
echo "--- WS: DDP roundtrip ---"
node "${SCRIPT_DIR}/ws-bench.mjs" "${WS_URL}" 2>&1

echo ""
echo "--- Memory: RSS ---"
# Find server PID by port
SERVER_PID=$(lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null | head -1)
if [ -n "$SERVER_PID" ]; then
  RSS_KB=$(ps -o rss= -p "$SERVER_PID" 2>/dev/null || echo "?")
  echo "PID: ${SERVER_PID}, RSS: ${RSS_KB} KB ($(echo "scale=1; ${RSS_KB}/1024" | bc 2>/dev/null || echo '?') MB)"
else
  echo "(could not find server PID)"
fi

echo ""
echo "================================================================"
