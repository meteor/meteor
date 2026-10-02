#!/usr/bin/env bash

set -euo pipefail

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd "$(dirname "$0")/../.."
export METEOR_HOME="$(pwd)"

# Make sure the dev_bundle matches the checked-out BUNDLE_VERSION before
# probing it for puppeteer: a cached dev_bundle from another branch passes the
# probe and is then replaced mid-run by the first real meteor invocation,
# taking its puppeteer install with it.
./meteor --version >/dev/null 2>&1 || true

# npm 11 can skip dependency install scripts, so package presence does not
# guarantee that a browser is available. Pin a Node 26-compatible version and
# run its awaited browser installer explicitly.
if ! ./dev_bundle/bin/node -e "process.exit(require('./dev_bundle/lib/node_modules/puppeteer/package.json').version === '25.9.0' ? 0 : 1)" 2>/dev/null; then
  ./meteor npm install -g puppeteer@25.9.0
fi

PUPPETEER_CACHE_ROOT="${TMPDIR:-/tmp}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_ROOT%/}/puppeteer-chrome-cache-25.9.0-v2-$(id -u)"
export PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=true

# The installer inherits the lock descriptor, so cancelled jobs cannot
# release the lock while an orphaned extraction still runs.
perl tools/tool-testing/clients/puppeteer/with-browser-lock.pl \
  "${PUPPETEER_CACHE_DIR}.flock" \
  ./dev_bundle/bin/node tools/tool-testing/clients/puppeteer/ensure-browser.cjs \
  "$METEOR_HOME/dev_bundle/lib/node_modules/puppeteer"

export PATH=$METEOR_HOME:$PATH

# Pick a free ephemeral port so concurrent matrix jobs sharing a self-hosted
# runner cannot collide on a fixed port. Override with TEST_PORT for local
# debugging. Falls back to 4096 if the node helper is unavailable.
if [ -z "${TEST_PORT:-}" ]; then
  TEST_PORT=$(./dev_bundle/bin/node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})' 2>/dev/null) || TEST_PORT=4096
fi
export URL="http://127.0.0.1:${TEST_PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'
export METEOR_NO_DEPRECATION=true

if [ "$#" -gt 0 ]; then
  exec 3< <(./meteor test-packages --driver-package test-in-console -p "${TEST_PORT}" --exclude "${TEST_PACKAGES_EXCLUDE:-}" "$1")
else
  exec 3< <(./meteor test-packages --driver-package test-in-console -p "${TEST_PORT}" --exclude "${TEST_PACKAGES_EXCLUDE:-}")
fi
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

./dev_bundle/bin/node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"
