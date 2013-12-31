#!/bin/bash

# stop on any non-zero return value from test-watch.js, and print "FAILED"
set -e
trap 'echo FAILED' EXIT

cd `dirname $0`
METEOR_DIR=$(pwd)/..

# run tests
./node.sh $METEOR_DIR/tools/tests/test-watch.js

# cleanup trap, and print "SUCCESS"
trap - EXIT
echo PASSED
