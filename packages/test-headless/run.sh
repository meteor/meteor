#!/usr/bin/env bash

# Run headless package tests with results printed to the terminal.
#
# Usage:
#   ./packages/test-headless/run.sh                 # Test all packages
#   ./packages/test-headless/run.sh "check"          # Test specific package
#   ./packages/test-headless/run.sh "mongo"           # Test specific package
#
# Unlike test-in-console, results flow via DDP (not console scraping),
# so there's no Puppeteer API fragility.

cd "$(dirname "$0")/../.."
export METEOR_HOME="$(pwd)"

# Install Puppeteer if needed (reuses dev_bundle install)
./meteor npm install -g puppeteer@23.6.0 2>/dev/null

export PATH="$METEOR_HOME:$PATH"

PORT=4097

# Start Meteor test-packages in background — output goes directly to terminal
./meteor test-packages \
  --driver-package test-headless \
  --once \
  -p $PORT \
  ${TEST_PACKAGES_EXCLUDE:+--exclude "$TEST_PACKAGES_EXCLUDE"} \
  $1 2>&1 &
METEOR_PID=$!
trap "kill $METEOR_PID 2>/dev/null; exit 1" SIGINT SIGTERM

# Wait for the HTTP server to be ready by polling the port
echo "Waiting for Meteor to start on port $PORT..."
while ! curl -s -o /dev/null http://127.0.0.1:$PORT/ 2>/dev/null; do
  # Check if Meteor died
  if ! kill -0 $METEOR_PID 2>/dev/null; then
    echo "Meteor process exited before server was ready"
    wait $METEOR_PID 2>/dev/null
    exit $?
  fi
  sleep 1
done

# Open a headless browser so client tests run.
# We don't scrape console — results flow via DDP to the server.
node -e "
  const puppeteer = require('$METEOR_HOME/dev_bundle/lib/node_modules/puppeteer');
  (async () => {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:$PORT/');
    // Just keep the page open — the server will exit when tests are done
    // which will kill this process too
  })().catch(e => { console.error('Puppeteer error:', e); process.exit(1); });
" &
PUPPETEER_PID=$!

# Wait for the Meteor process to exit (it calls process.exit when tests complete)
wait $METEOR_PID 2>/dev/null
STATUS=$?

kill $PUPPETEER_PID 2>/dev/null
exit $STATUS
