#!/usr/bin/env bash

# From a Meteor checkout:
#   ./packages/test-in-console/run.sh                 # test every core package
#   ./packages/test-in-console/run.sh "mongo"         # test one package
#   ./packages/test-in-console/run.sh --shard 2/6     # test shard 2 of 6
#
# Phase 6 adds --shard i/N: we compute the shard's package list locally
# (scripts/list-test-packages.js, no meteor tool needed) and pass each
# name as a positional arg to `meteor test-packages`. The old no-arg and
# single-package invocations still work unchanged.

set -u

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

# Parse flags ourselves so we can recognise --shard i/N before invoking
# meteor. Everything we don't consume is forwarded to meteor test-packages
# as positional args (so "./run.sh mongo" still works).
SHARD=""
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --shard)
      SHARD="$2"
      shift 2
      ;;
    --shard=*)
      SHARD="${1#--shard=}"
      shift
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

# Port for the test-driver web server. Override per-shard in CI so two
# shards on the same host don't collide.
PORT="${METEOR_TEST_PACKAGES_PORT:-4096}"

# Resolve the package list we want to hand to meteor test-packages.
# Do this BEFORE installing puppeteer so that a bad --shard doesn't make
# the user pay the install cost.
PACKAGES=()
if [ -n "$SHARD" ]; then
  if [ ${#POSITIONAL[@]} -gt 0 ]; then
    echo "run.sh: --shard cannot be combined with a positional package argument" >&2
    exit 2
  fi
  if ! node "$METEOR_HOME/scripts/list-test-packages.js" \
          --shard "$SHARD" \
          --exclude "${TEST_PACKAGES_EXCLUDE:-}" \
          > /tmp/test-in-console-shard.list 2>/tmp/test-in-console-shard.err; then
    cat /tmp/test-in-console-shard.err >&2
    echo "run.sh: list-test-packages failed for shard $SHARD" >&2
    exit 2
  fi
  cat /tmp/test-in-console-shard.err >&2
  while IFS= read -r line; do
    [ -n "$line" ] && PACKAGES+=("$line")
  done < /tmp/test-in-console-shard.list
  if [ ${#PACKAGES[@]} -eq 0 ]; then
    echo "run.sh: shard $SHARD is empty, nothing to test" >&2
    exit 0
  fi
  echo "run.sh: testing ${#PACKAGES[@]} package(s) from shard $SHARD on port $PORT" >&2
elif [ ${#POSITIONAL[@]} -gt 0 ]; then
  PACKAGES=("${POSITIONAL[@]}")
fi

# Install puppeteer into dev_bundle only when it is not already available globally
# (e.g. on oss-vm, where puppeteer@23.6.0 is pre-installed via system npm and
# NODE_PATH is set to $(npm root -g) by the CI workflow).
if ! node -e "require('./dev_bundle/lib/node_modules/puppeteer')" 2>/dev/null && \
   ! node -e "require('puppeteer')" 2>/dev/null; then
  ./meteor npm install -g puppeteer@23.6.0
fi

export PATH=$METEOR_HOME:$PATH

export URL="http://127.0.0.1:${PORT}/"
export METEOR_PACKAGE_DIRS='packages/deprecated'

# Build the meteor command. When PACKAGES is empty, meteor tests all
# core packages (legacy behavior). --exclude still applies either way.
METEOR_ARGS=(test-packages --driver-package test-in-console -p "$PORT" \
             --exclude "${TEST_PACKAGES_EXCLUDE:-}")
if [ ${#PACKAGES[@]} -gt 0 ]; then
  METEOR_ARGS+=("${PACKAGES[@]}")
fi

# Start meteor with stdout/stderr going to a log file, then fork a tail -f
# on the log so the user sees progress in real time. We deliberately avoid
# the shorter `./meteor ... | tee $LOG &` form because `$!` after a pipe
# captures the PID of the LAST stage (tee) — we'd never be able to tear
# down the meteor tree at the end of the run. With a bare background
# redirection, `$!` is the meteor PID itself and `pkill -P $METEOR_PID`
# reaches the mongod + app children correctly.
METEOR_LOG="${METEOR_LOG:-/tmp/test-in-console-meteor.log}"
rm -f "$METEOR_LOG"
./meteor "${METEOR_ARGS[@]}" > "$METEOR_LOG" 2>&1 &
METEOR_PID=$!
tail -f "$METEOR_LOG" &
TAIL_PID=$!
cleanup() {
  kill "$TAIL_PID" 2>/dev/null || true
  pkill -TERM -P "$METEOR_PID" 2>/dev/null || true
  kill "$METEOR_PID" 2>/dev/null || true
  # Give children time to exit cleanly; then escalate.
  sleep 1
  pkill -9 -P "$METEOR_PID" 2>/dev/null || true
  kill -9 "$METEOR_PID" 2>/dev/null || true
}
trap "cleanup; exit 1" SIGINT SIGTERM

# Poll the log for the listening marker. Fail fast if meteor exits early.
echo "run.sh: waiting for 'test-in-console listening' marker..."
LISTEN_TIMEOUT=$((600 * ${TIMEOUT_SCALE_FACTOR:-1}))
for _ in $(seq 1 "$LISTEN_TIMEOUT"); do
  if ! kill -0 $METEOR_PID 2>/dev/null; then
    echo "run.sh: meteor exited before listening — last log lines:" >&2
    tail -30 "$METEOR_LOG" >&2
    exit 1
  fi
  if grep -q "test-in-console listening" "$METEOR_LOG" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Wait until the HTTP server is actually accepting connections before launching
# Puppeteer. 'test-in-console listening' is emitted by the test driver before
# the HTTP port is fully bound, so a bare goto() would time out on slow starts.
echo "run.sh: waiting for test server at $URL..."
for _ in $(seq 1 "$LISTEN_TIMEOUT"); do
  if curl --silent --output /dev/null --fail "$URL"; then
    echo "run.sh: test server accepting HTTP."
    break
  fi
  sleep 1
done

# Scale the Puppeteer navigation timeout by TIMEOUT_SCALE_FACTOR (same env
# self-test uses). Default 5 min gives room for a shard's first-build on
# a cold local checkout; CI sets TIMEOUT_SCALE_FACTOR=20 which pushes it
# to 10+ min safely.
if [ -z "${PUPPETEER_NAV_TIMEOUT_MS:-}" ]; then
  scale="${TIMEOUT_SCALE_FACTOR:-1}"
  # scale is a string like "20" — multiply 300000 by it via awk so we
  # don't need bash arithmetic on non-integers.
  export PUPPETEER_NAV_TIMEOUT_MS=$(awk "BEGIN { printf \"%d\", 300000 * $scale }")
fi
echo "PUPPETEER_NAV_TIMEOUT_MS=${PUPPETEER_NAV_TIMEOUT_MS}"

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?

# Tear down the tail + meteor + its children (mongod, app).
cleanup
wait "$METEOR_PID" 2>/dev/null || true
exit $STATUS
