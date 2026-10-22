#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd "$(dirname "$0")/../.." || exit 1
export METEOR_HOME="$PWD"

# Install puppeteer into dev_bundle only when it is not already available globally
# (e.g. on oss-vm, where puppeteer@23.6.0 is pre-installed via system npm and
# NODE_PATH is set to $(npm root -g) by the CI workflow).
if ! node -e "require('./dev_bundle/lib/node_modules/puppeteer')" 2>/dev/null && \
   ! node -e "require('puppeteer')" 2>/dev/null; then
  ./meteor npm install -g puppeteer@23.6.0
fi

export PATH="$METEOR_HOME:$PATH"

# Avoid colliding with other jobs on a shared runner. TEST_PORT can override
# the selected port when debugging locally.
if [ -z "${TEST_PORT:-}" ]; then
  TEST_PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})') || exit 1
fi
export URL="http://127.0.0.1:${TEST_PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'
export METEOR_NO_DEPRECATION=true

TEST_STARTUP_TIMEOUT=${TEST_STARTUP_TIMEOUT:-1200}
if ! [[ "$TEST_STARTUP_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "TEST_STARTUP_TIMEOUT must be a positive number of seconds." >&2
  exit 1
fi
STARTUP_DEADLINE=$((SECONDS + TEST_STARTUP_TIMEOUT))

exec 3< <(exec ./meteor test-packages --driver-package test-in-console -p "$TEST_PORT" --exclude "${TEST_PACKAGES_EXCLUDE:-}" "$@" 2>&1)
EXEC_PID=$!
OUTPUT_PID=''

cleanup() {
  pkill -TERM -P "$EXEC_PID" 2>/dev/null || true
  kill -TERM "$EXEC_PID" 2>/dev/null || true
  if [ -n "$OUTPUT_PID" ]; then
    kill "$OUTPUT_PID" 2>/dev/null || true
  fi
  exec 3<&-
}
trap cleanup EXIT
trap 'exit 1' SIGINT SIGTERM

# Bound the wait for the marker as well as HTTP readiness. Keep stdout and
# stderr visible so a failed Meteor or Mongo startup retains its diagnostics.
while true; do
  if ((SECONDS >= STARTUP_DEADLINE)); then
    echo "Timed out waiting for the test-in-console readiness marker." >&2
    exit 1
  fi
  if IFS= read -r -t 1 line <&3; then
    printf '%s\n' "$line"
    if [[ "$line" == *'test-in-console listening' ]]; then
      break
    fi
  else
    READ_STATUS=$?
    if ((READ_STATUS <= 128)) || ! kill -0 "$EXEC_PID" 2>/dev/null; then
      echo "Meteor exited before the test-in-console readiness marker." >&2
      exit 1
    fi
  fi
done

# Continue draining output after the marker, including while Puppeteer runs.
cat <&3 &
OUTPUT_PID=$!

# Wait until the HTTP server is actually accepting connections before launching
# Puppeteer. 'test-in-console listening' is emitted by the test driver before
# the HTTP port is fully bound, so a bare goto() would time out on slow starts.
echo "Waiting for test server at $URL..."
while true; do
  if ! kill -0 "$EXEC_PID" 2>/dev/null; then
    echo "Meteor exited before the test server became available at $URL." >&2
    exit 1
  fi
  if ((SECONDS >= STARTUP_DEADLINE)); then
    echo "Timed out waiting for the test server at $URL." >&2
    exit 1
  fi
  if curl --silent --output /dev/null --fail --max-time 2 "$URL"; then
    break
  fi
  sleep 1
done
echo "Test server is ready."

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?

exit "$STATUS"
