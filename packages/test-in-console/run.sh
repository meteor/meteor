#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

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

# Self-hosted runners can share a machine with other jobs. Use a free port
# instead of attaching to an unrelated server already listening on 4096.
if [ -z "${TEST_PORT:-}" ]; then
  TEST_PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})') || exit 1
fi
export URL="http://127.0.0.1:${TEST_PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'
export METEOR_NO_DEPRECATION=true

exec 3< <(./meteor test-packages --driver-package test-in-console -p "$TEST_PORT" --exclude "${TEST_PACKAGES_EXCLUDE:-}" $1)
EXEC_PID=$!
cleanup() {
  pkill -TERM -P "$EXEC_PID" 2>/dev/null || true
  kill "$EXEC_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap "exit 1" SIGINT SIGTERM

# EOF without our driver's readiness marker is a startup failure, even if an
# unrelated HTTP server answers on the selected port.
READY=false
while IFS= read -r LINE <&3; do
  printf '%s\n' "$LINE"
  if [[ "$LINE" == *"test-in-console listening" ]]; then
    READY=true
    break
  fi
done
if [ "$READY" != true ]; then
  echo "Meteor exited before the test driver became ready" >&2
  exit 1
fi

# Wait until the HTTP server is actually accepting connections before launching
# Puppeteer. 'test-in-console listening' is emitted by the test driver before
# the HTTP port is fully bound, so a bare goto() would time out on slow starts.
echo "Waiting for test server at $URL..."
until curl --silent --output /dev/null --fail --connect-timeout 2 --max-time 5 "$URL"; do
  if ! kill -0 "$EXEC_PID" 2>/dev/null; then
    echo "Meteor exited before the test server became ready" >&2
    exit 1
  fi
  sleep 1
done
echo "Test server is ready."

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?

exit $STATUS
