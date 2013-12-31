#!/bin/bash

# stop on any non-zero return value from test-bundler.js, and print "FAILED"
set -e
trap 'echo FAILED' EXIT

cd `dirname $0`
METEOR_DIR=$(pwd)/..

# run tests
./node.sh $METEOR_DIR/tools/tests/test-bundler.js

# cleanup trap, and print "SUCCESS"
trap - EXIT
echo PASSED
