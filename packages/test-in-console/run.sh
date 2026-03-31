#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd "$(dirname "$0")/../.."
export METEOR_HOME="$(pwd)"

# Decide whether to use Docker (Linux + Docker available) or native Puppeteer.
# On Linux, Docker lets us use --network=host so the container can reach the
# Meteor server on 127.0.0.1:4096 without any port-mapping gymnastics.
# On macOS, Docker Desktop does not support --network=host, so we fall back to
# installing Puppeteer natively into dev_bundle.
USE_DOCKER=false
if [ "$(uname)" = "Linux" ] && command -v docker >/dev/null 2>&1; then
  USE_DOCKER=true
fi

# Install puppeteer into dev_bundle/lib/node_modules/puppeteer.
# Only needed when not using Docker (i.e. local macOS development).
if [ "$USE_DOCKER" = "false" ]; then
  PUPPETEER_VERSION="24.15.0"
  PUPPETEER_PKG="$METEOR_HOME/dev_bundle/lib/node_modules/puppeteer/package.json"
  PUPPETEER_INSTALLED=$(node -p "try{require('$PUPPETEER_PKG').version}catch(e){''}" 2>/dev/null || true)
  if [ "$PUPPETEER_INSTALLED" != "$PUPPETEER_VERSION" ]; then
    ./meteor npm install -g "puppeteer@$PUPPETEER_VERSION"
  else
    echo "puppeteer@$PUPPETEER_VERSION already installed, skipping."
  fi
fi

export PATH=$METEOR_HOME:$PATH

export URL='http://127.0.0.1:4096/'
export METEOR_PACKAGE_DIRS='packages/deprecated'

exec 3< <(./meteor test-packages --driver-package test-in-console -p 4096 --exclude ${TEST_PACKAGES_EXCLUDE:-''} ${1:-})
EXEC_PID=$!
trap "pkill -TERM -P $EXEC_PID; exit 1" SIGINT

sed '/test-in-console listening$/q' <&3
# Drain remaining meteor output to prevent pipe buffer from filling,
# which would block Meteor's synchronous stdout writes and freeze the HTTP server.
cat <&3 >/dev/null &

# Wait for the server to finish building the bundle and serve the page.
# 'test-in-console listening' only means the HTTP port is open; the first
# request triggers the full bundle build which can take several minutes on
# a cold runner. Polling with curl here means Puppeteer navigates immediately
# to a fully built page instead of waiting for it under a navigation timeout.
echo "Waiting for Meteor test server to finish building..."
until curl -sfL --max-time 60 "$URL" -o /dev/null 2>/dev/null; do
  # Abort early if Meteor died rather than looping forever.
  if ! kill -0 $EXEC_PID 2>/dev/null; then
    echo "Meteor process died while waiting for the server to become ready."
    exit 1
  fi
  sleep 5
done
# Grace period: Meteor briefly restarts its HTTP server after serving the
# first bundled response. Without this delay Puppeteer can connect during
# that window and get ERR_CONNECTION_REFUSED.
sleep 5
echo "Server is ready."

# Run the Puppeteer test runner — either inside Docker or natively.
# Docker: Chrome + all system libs are baked into the image; --network=host
#         lets the container reach the Meteor server on 127.0.0.1:4096.
# Native: Puppeteer was installed into dev_bundle above.
if [ "$USE_DOCKER" = "true" ]; then
  PUPPETEER_IMAGE="ghcr.io/puppeteer/puppeteer:24.15.0"
  echo "Running Puppeteer inside Docker ($PUPPETEER_IMAGE)..."
  docker run --rm \
    --network=host \
    --ipc=host \
    -e URL="$URL" \
    -v "$METEOR_HOME/packages/test-in-console:/app:ro" \
    "$PUPPETEER_IMAGE" \
    node /app/puppeteer_runner.js
else
  node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"
fi

STATUS=$?

pkill -TERM -P $EXEC_PID || true
exit $STATUS
