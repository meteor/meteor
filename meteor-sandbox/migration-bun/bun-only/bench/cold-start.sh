#!/usr/bin/env bash
# cold-start.sh — Measure time to first HTTP 200
#
# Usage: ./cold-start.sh <label> <command...>
#
# Example:
#   ./cold-start.sh "Node legacy" node main.js
#   ./cold-start.sh "Bun ESM" bun bun-host.mjs programs/server

set -e

LABEL="$1"
shift
CMD="$@"
PORT="${PORT:-3000}"
RUNS=5

echo "Cold start: ${LABEL}"
echo "Command: ${CMD}"
echo "Port: ${PORT}"
echo "Runs: ${RUNS}"
echo ""

TIMES=()

for i in $(seq 1 $RUNS); do
  START=$(date +%s%N)

  # Start server in background
  eval "$CMD" &>/dev/null &
  PID=$!

  # Wait for HTTP 200
  for attempt in $(seq 1 100); do
    if curl -s -o /dev/null -w '' "http://localhost:${PORT}/" 2>/dev/null; then
      END=$(date +%s%N)
      MS=$(( (END - START) / 1000000 ))
      TIMES+=($MS)
      echo "  Run $i: ${MS} ms"
      break
    fi
    sleep 0.1
  done

  # Kill server
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null || true
  sleep 0.5
done

# Stats
if [ ${#TIMES[@]} -gt 0 ]; then
  SUM=0
  MIN=${TIMES[0]}
  MAX=${TIMES[0]}
  for t in "${TIMES[@]}"; do
    SUM=$((SUM + t))
    [ $t -lt $MIN ] && MIN=$t
    [ $t -gt $MAX ] && MAX=$t
  done
  AVG=$((SUM / ${#TIMES[@]}))
  echo ""
  echo "Results: min=${MIN}ms avg=${AVG}ms max=${MAX}ms (${#TIMES[@]} runs)"
fi
