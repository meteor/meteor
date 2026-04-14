#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"
# or to run tests in parallel (default 4 concurrent package groups)
# ./packages/test-in-console/run.sh --parallel
# ./packages/test-in-console/run.sh --parallel=8
# ./packages/test-in-console/run.sh "mongo" --parallel
# packages listed in --serial-packages run one-at-a-time after all other packages
# (defaults to "mongo" when --parallel is used)
# ./packages/test-in-console/run.sh --parallel --serial-packages="mongo,allow-deny"

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

export URL='http://127.0.0.1:4096/'
export METEOR_PACKAGE_DIRS='packages/deprecated'

# Parse arguments: separate the package filter (first positional arg) from flags.
PACKAGE_FILTER=""
PARALLEL_FLAG=""
SERIAL_PACKAGES_FLAG=""
PORT="${TEST_PORT:-4096}"
for arg in "$@"; do
  case "$arg" in
    --parallel|--parallel=*)
      PARALLEL_FLAG="$arg"
      ;;
    --port=*)
      PORT="${arg#--port=}"
      ;;
    --serial-packages=*)
      SERIAL_PACKAGES_FLAG="$arg"
      ;;
    *)
      # Treat the first non-flag argument as the package filter.
      if [[ -z "$PACKAGE_FILTER" ]]; then
        PACKAGE_FILTER="$arg"
      fi
      ;;
  esac
done

export URL="http://127.0.0.1:$PORT/"
MONGO_PORT=$(($PORT + 1))

# Kill all processes related to a test run on the given port (meteor tools,
# server app, mongod). Sending SIGTERM first then SIGKILL for mongod.
cleanup() {
  pkill -TERM -f "test-packages.*-p $PORT" 2>/dev/null
  pkill -TERM -f "mongod.*--port $MONGO_PORT" 2>/dev/null
  sleep 1
  pkill -9 -f "mongod.*--port $MONGO_PORT" 2>/dev/null
  pkill -TERM -P $EXEC_PID 2>/dev/null
}

EXCLUDE_FLAG=""
if [[ -n "${TEST_PACKAGES_EXCLUDE:-}" ]]; then
  EXCLUDE_FLAG="--exclude $TEST_PACKAGES_EXCLUDE"
fi
exec 3< <(./meteor test-packages --driver-package test-in-console -p "$PORT" $EXCLUDE_FLAG $PARALLEL_FLAG $SERIAL_PACKAGES_FLAG $PACKAGE_FILTER)
EXEC_PID=$!
trap "cleanup; exit 1" SIGINT SIGTERM

sed '/test-in-console listening$/q' <&3

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

cleanup
exit $STATUS
