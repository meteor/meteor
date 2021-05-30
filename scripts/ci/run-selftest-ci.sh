#!/usr/bin/env bash

set -e
set -u

ulimit -c unlimited; # Set core dump size as Ubuntu 14.04 lacks prlimit.
ulimit -a # Display all ulimit settings for transparency.

METEOR_SELF_TEST_RETRIES=0

pushd tools
# Ensure that meteor/tools has no TypeScript errors.
echo "install @types/node"
npm install @types/node --save-dev
echo "typescript compiler starting"
../meteor npx tsc --noEmit
echo "typescript compiler finished"
popd
echo "meteor get-ready starting"
./meteor --get-ready
echo "meteor get-ready finished"

# selftest
echo "meteor self-test first 0-50 starting"
./meteor self-test \
              --headless \
              --without-tag "custom-warehouse" \
              --retries ${METEOR_SELF_TEST_RETRIES} \
              --exclude "add debugOnly and prodOnly packages" \
              --limit 50 \
              --skip 0
echo "meteor self-test first 0-50 finished"
echo "meteor self-test first 51-100 starting"
./meteor self-test \
              --headless \
              --without-tag "custom-warehouse" \
              --retries ${METEOR_SELF_TEST_RETRIES} \
              --exclude "add debugOnly and prodOnly packages" \
              --limit 100 \
              --skip 50
echo "meteor self-test first 51-100 finished"
echo "meteor self-test first 101- starting"
./meteor self-test \
              --headless \
              --without-tag "custom-warehouse" \
              --retries ${METEOR_SELF_TEST_RETRIES} \
              --exclude "add debugOnly and prodOnly packages" \
              --skip 100
echo "meteor self-test first 101- finished"
echo "meteor self-test isolated starting"
./meteor self-test \
              'add debugOnly and prodOnly packages' \
              --retries ${METEOR_SELF_TEST_RETRIES} \
              --headless
echo "meteor self-test isolated finished"
