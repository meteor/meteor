#!/usr/bin/env bash

set -euo pipefail

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd "$(dirname "$0")/../.."
export METEOR_HOME="$(pwd)"

# npm 11 can skip dependency install scripts, so package presence does not
# guarantee that a browser is available. Pin a Node 26-compatible version and
# run its awaited browser installer explicitly.
if ! ./dev_bundle/bin/node -e "process.exit(require('./dev_bundle/lib/node_modules/puppeteer/package.json').version === '25.9.0' ? 0 : 1)" 2>/dev/null; then
  ./meteor npm install -g puppeteer@25.9.0
fi

PUPPETEER_CACHE_ROOT="${TMPDIR:-/tmp}"
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_ROOT%/}/puppeteer-chrome-cache-25.9.0"
export PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=true

PUPPETEER_INSTALL_LOCK="${PUPPETEER_CACHE_DIR}.lock"
PUPPETEER_LOCK_ACQUIRED=false
PUPPETEER_LOCK_HEARTBEAT_PID=""

cleanup_puppeteer_lock() {
  if [ "$PUPPETEER_LOCK_ACQUIRED" = true ]; then
    if [ -n "$PUPPETEER_LOCK_HEARTBEAT_PID" ]; then
      kill "$PUPPETEER_LOCK_HEARTBEAT_PID" 2>/dev/null || true
      wait "$PUPPETEER_LOCK_HEARTBEAT_PID" 2>/dev/null || true
    fi
    rm -f "$PUPPETEER_INSTALL_LOCK/pid"
    rmdir "$PUPPETEER_INSTALL_LOCK" 2>/dev/null || true
  fi
}

trap cleanup_puppeteer_lock EXIT
trap 'exit 1' INT TERM

# Multiple test jobs can share a self-hosted runner. Wait until the current
# installer has completely finished instead of accepting a browser binary that
# appeared while the rest of its directory was still being extracted.
for ((attempt = 0; attempt < 600; attempt++)); do
  if mkdir "$PUPPETEER_INSTALL_LOCK" 2>/dev/null; then
    PUPPETEER_LOCK_ACQUIRED=true
    printf '%s\n' "$$" > "$PUPPETEER_INSTALL_LOCK/pid"
    break
  fi

  if ./dev_bundle/bin/node -e '
    const fs = require("fs");
    const age = Date.now() - fs.statSync(process.argv[1]).mtimeMs;
    process.exit(age > 2 * 60 * 1000 ? 0 : 1);
  ' "$PUPPETEER_INSTALL_LOCK" 2>/dev/null; then
    rm -f "$PUPPETEER_INSTALL_LOCK/pid"
    rmdir "$PUPPETEER_INSTALL_LOCK" 2>/dev/null || true
    continue
  fi

  sleep 1
done

if [ "$PUPPETEER_LOCK_ACQUIRED" != true ]; then
  echo "Timed out waiting for another Puppeteer installation" >&2
  exit 1
fi

(
  while [ -d "$PUPPETEER_INSTALL_LOCK" ]; do
    touch "$PUPPETEER_INSTALL_LOCK"
    sleep 30
  done
) &
PUPPETEER_LOCK_HEARTBEAT_PID=$!

check_puppeteer() {
  ./dev_bundle/bin/node <<'NODE'
const { execFile } = require("child_process");
const { statSync } = require("fs");
const puppeteer = require("./dev_bundle/lib/node_modules/puppeteer");

Promise.resolve(puppeteer.executablePath()).then((executablePath) => {
  if (!statSync(executablePath).isFile()) {
    process.exit(1);
  }
  execFile(executablePath, ["--version"], { timeout: 30000 }, (error) => {
    process.exit(error ? 1 : 0);
  });
}).catch(() => process.exit(1));
NODE
}

if ! check_puppeteer; then
  # The installer skips an existing browser directory, even if extraction was
  # interrupted. Remove this version-specific cache before retrying.
  ./dev_bundle/bin/node -e 'require("fs").rmSync(process.env.PUPPETEER_CACHE_DIR, { force: true, recursive: true })'
  ./dev_bundle/bin/node ./dev_bundle/lib/node_modules/puppeteer/install.mjs
  if ! check_puppeteer; then
    echo "Chrome for Puppeteer is unavailable after installation" >&2
    exit 1
  fi
fi

cleanup_puppeteer_lock
trap - EXIT INT TERM

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
