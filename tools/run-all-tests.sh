#!/bin/bash

METEOR_DIR=`pwd`/..

trap 'echo FAILED' EXIT

# Die on failure, print commands being executed
set -e -x

# Test the Meteor CLI
./cli-test.sh

# Run bundler unit tests
./bundler-test.sh

# Test all packages, adding 'kill-server-on-test-completion'
(sleep 1; open http://localhost:3000) &
PACKAGE_DIRS=$METEOR_DIR/tools/cli-test-packages/ $METEOR_DIR/meteor test-packages --once

trap - EXIT
echo PASSED

