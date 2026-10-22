#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

# Reuse the runner's pinned Puppeteer when available.
if ! node -e "require('./dev_bundle/lib/node_modules/puppeteer')" 2>/dev/null && \
   ! node -e "require('puppeteer')" 2>/dev/null; then
  ./meteor npm install -g puppeteer@23.6.0
fi

export PATH=$METEOR_HOME:$PATH

export URL='http://127.0.0.1:4096/'
export METEOR_PACKAGE_DIRS='packages/deprecated'

exec 3< <(./meteor test-packages --driver-package test-in-console --extra-packages jquery -p 4096 --exclude "${TEST_PACKAGES_EXCLUDE:-}" $1)
EXEC_PID=$!
trap "pkill -TERM -P $EXEC_PID; exit 1" SIGINT

sed '/test-in-console listening$/q' <&3

# The driver can announce readiness before the HTTP port is bound.
echo "Waiting for test server at $URL..."
until curl --silent --output /dev/null --fail --connect-timeout 2 --max-time 5 "$URL"; do
  if ! kill -0 "$EXEC_PID" 2>/dev/null; then
    echo "Meteor exited before the test server became ready" >&2
    exit 1
  fi
  sleep 1
done

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?

pkill -TERM -P $EXEC_PID
exit $STATUS
