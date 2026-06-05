#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

set -u

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

# Install puppeteer into dev_bundle only when it is not already available globally
# (e.g. on oss-vm, where puppeteer@23.6.0 is pre-installed via system npm and
# NODE_PATH is set to $(npm root -g) by the CI workflow).
if ! node -e "require('./dev_bundle/lib/node_modules/puppeteer')" 2>/dev/null && \
   ! node -e "require('puppeteer')" 2>/dev/null; then
  ./meteor npm install -g puppeteer@23.6.0
fi

export PATH=$METEOR_HOME:$PATH

# Pick a free ephemeral port so concurrent matrix jobs sharing a self-hosted
# runner cannot collide on a fixed port. Override with TEST_PORT for local
# debugging. Falls back to 4096 if the node helper is unavailable.
if [ -z "${TEST_PORT:-}" ]; then
  TEST_PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})' 2>/dev/null) || TEST_PORT=4096
fi
export URL="http://127.0.0.1:${TEST_PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'
export METEOR_NO_DEPRECATION=true

TEST_LOG=$(mktemp -t meteor-test-in-console.XXXXXX.log)
METEOR_PID=""
TAIL_PID=""

cleanup() {
  if [ -n "${TAIL_PID:-}" ] && kill -0 "$TAIL_PID" 2>/dev/null; then
    kill "$TAIL_PID" 2>/dev/null || true
  fi
  if [ -n "${METEOR_PID:-}" ] && kill -0 "$METEOR_PID" 2>/dev/null; then
    pkill -TERM -P "$METEOR_PID" 2>/dev/null || true
    kill -TERM "$METEOR_PID" 2>/dev/null || true
    # Give meteor a moment to flush, then force.
    for _ in 1 2 3 4 5; do
      kill -0 "$METEOR_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$METEOR_PID" 2>/dev/null || true
  fi
}

# When CI sends SIGTERM ahead of timeout-minutes, capture diagnostics before
# exiting so the cancelled job has a chance of being actionable.
on_signal() {
  local sig="$1"
  echo "run.sh: received ${sig}; dumping diagnostics" >&2
  if [ -n "${TEST_LOG:-}" ] && [ -f "$TEST_LOG" ]; then
    echo "=== last 200 lines of meteor output ===" >&2
    tail -n 200 "$TEST_LOG" >&2 || true
  fi
  cleanup
  exit 130
}
trap cleanup EXIT
trap 'on_signal SIGINT' SIGINT
trap 'on_signal SIGTERM' SIGTERM

# Start meteor in the background, redirected to a log file. This is more
# robust than the previous `exec 3< <(./meteor ...)` pattern: $! is reliable
# (it's meteor's actual PID, not a process-substitution subshell), nothing
# can deadlock on a stalled pipe-buffer reader, and signal handlers can dump
# the log tail. Preserve the original unquoted expansion of TEST_PACKAGES_EXCLUDE
# and $1 so callers that depend on word-splitting (e.g. multi-package args)
# behave identically to the prior script.
./meteor test-packages --driver-package test-in-console -p "${TEST_PORT}" --exclude ${TEST_PACKAGES_EXCLUDE:-''} ${1:-} \
  >"$TEST_LOG" 2>&1 &
METEOR_PID=$!

# Mirror meteor output to our stdout so the CI log stays live and meteor's
# stdout pipe never fills up.
tail -F -n +1 "$TEST_LOG" 2>/dev/null &
TAIL_PID=$!

# Wait for the readiness marker, with a hard cap. Without this the script
# could hang here forever if meteor failed to bind the port silently.
READY_TIMEOUT_S="${METEOR_READY_TIMEOUT_S:-600}"
READY_DEADLINE=$(( $(date +%s) + READY_TIMEOUT_S ))
echo "Waiting for meteor readiness marker (up to ${READY_TIMEOUT_S}s)..."
while true; do
  if grep -qF 'test-in-console listening' "$TEST_LOG" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$METEOR_PID" 2>/dev/null; then
    echo "meteor exited before becoming ready — aborting" >&2
    exit 1
  fi
  if [ "$(date +%s)" -ge "$READY_DEADLINE" ]; then
    echo "meteor did not emit readiness marker within ${READY_TIMEOUT_S}s — aborting" >&2
    exit 1
  fi
  sleep 1
done

# Wait until the HTTP server is actually accepting connections before launching
# Puppeteer. 'test-in-console listening' is emitted before the HTTP port is
# fully bound, so a bare goto() would time out on slow starts. Bound the wait
# so this loop cannot itself become a silent stall.
HTTP_TIMEOUT_S="${METEOR_HTTP_READY_TIMEOUT_S:-180}"
HTTP_DEADLINE=$(( $(date +%s) + HTTP_TIMEOUT_S ))
echo "Waiting for test server at $URL (up to ${HTTP_TIMEOUT_S}s)..."
until curl --silent --output /dev/null --fail "$URL"; do
  if ! kill -0 "$METEOR_PID" 2>/dev/null; then
    echo "meteor exited while waiting for HTTP server — aborting" >&2
    exit 1
  fi
  if [ "$(date +%s)" -ge "$HTTP_DEADLINE" ]; then
    echo "test server at $URL did not accept connections within ${HTTP_TIMEOUT_S}s — aborting" >&2
    exit 1
  fi
  sleep 1
done
echo "Test server is ready."

# Soft-timeout: stay below the GH Actions workflow `timeout-minutes` so we
# always have a chance to print the watchdog dump before the runner kills us.
# Default 25 min; override with PUPPETEER_SOFT_TIMEOUT_S. Use `timeout` if
# available, otherwise fall back to a plain invocation.
PUPPETEER_SOFT_TIMEOUT_S="${PUPPETEER_SOFT_TIMEOUT_S:-1500}"
if command -v timeout >/dev/null 2>&1; then
  timeout --signal=TERM --kill-after=30s "${PUPPETEER_SOFT_TIMEOUT_S}s" \
    node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"
  STATUS=$?
  if [ "$STATUS" -eq 124 ]; then
    echo "puppeteer_runner exceeded soft timeout of ${PUPPETEER_SOFT_TIMEOUT_S}s" >&2
  fi
else
  node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"
  STATUS=$?
fi

exit $STATUS
