#!/usr/bin/env bash

# Fail the entire test suite if any runTests command fails:
set -e

cd $(dirname $0)
TEST_DIR=$(pwd)

BABEL_CACHE_DIR=${TEST_DIR}/.cache
export BABEL_CACHE_DIR

# force fibers to be disabled
export DISABLE_FIBERS=1
export IGNORE_ASYNC_PLUGIN=1

runTests() {
    mocha \
        --reporter spec \
        --full-trace \
        --require ../runtime.js \
        --require ${TEST_DIR}/register.js \
        tests.js
}

runTests

if [ $(node -p "parseInt(process.versions.node)") -ge "8" ]
then
    echo "Running tests again with default options..."
    echo
    export IGNORE_NODE_MAJOR_VERSION=1
    runTests

    echo "Running tests again with modern browser options..."
    echo
    export COMPILE_FOR_MODERN_BROWSERS=1
    runTests
fi
