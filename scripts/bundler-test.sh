#!/bin/bash

# stop on any non-zero return value from test_bundler.js, and print "FAILED"
set -e
trap 'echo FAILED' EXIT

METEOR_DIR=$(pwd)/..

# run tests
./node.sh $METEOR_DIR/tools/tests/test_bundler.js

# cleanup trap, and print "SUCCESS"
trap - EXIT
echo PASSED
