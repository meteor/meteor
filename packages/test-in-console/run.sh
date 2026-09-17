#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

# Make sure the dev_bundle matches the checked-out BUNDLE_VERSION before
# probing it for puppeteer: a cached dev_bundle from another branch passes the
# probe and is then replaced mid-run by the first real meteor invocation,
# taking its puppeteer install with it.
./meteor --version >/dev/null 2>&1 || true

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
if [ -z "$TEST_PORT" ]; then
  TEST_PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})' 2>/dev/null) || TEST_PORT=4096
fi
export URL="http://127.0.0.1:${TEST_PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'
export METEOR_NO_DEPRECATION=true

exec 3< <(./meteor test-packages --driver-package test-in-console -p ${TEST_PORT} --exclude ${TEST_PACKAGES_EXCLUDE:-''} $1)
EXEC_PID=$!

cleanup() {
  pkill -TERM -P $EXEC_PID 2>/dev/null || true
}
trap cleanup EXIT
trap "cleanup; exit 1" SIGINT SIGTERM

sed '/test-in-console listening$/q' <&3

# If meteor exited before emitting the readiness marker (e.g. failed to bind
# the port), bail out — otherwise the curl loop below would happily latch onto
# an unrelated server on the same port and run the tests against the wrong
# meteor.
if ! kill -0 $EXEC_PID 2>/dev/null; then
  echo "meteor exited before becoming ready — aborting" >&2
  exit 1
fi

# Wait until the HTTP server is actually accepting connections before launching
# Puppeteer. 'test-in-console listening' is emitted by the test driver before
# the HTTP port is fully bound, so a bare goto() would time out on slow starts.
echo "Waiting for test server at $URL..."
until curl --silent --output /dev/null --fail "$URL"; do
  sleep 1
done
echo "Test server is ready."

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?
exit $STATUS
