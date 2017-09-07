#!/usr/bin/env bash

cd $(dirname $0)
TEST_DIR=$(pwd)

BABEL_CACHE_DIR=${TEST_DIR}/.cache
export BABEL_CACHE_DIR

runTests() {
    mocha \
        --reporter spec \
        --full-trace \
        --require ../runtime.js \
        --compilers js:${TEST_DIR}/register.js \
        tests.js
}

runTests

if [ $(node -p "parseInt(process.versions.node)") -ge "8" ]
then
    echo "Running tests again with default options..."
    echo
    export IGNORE_NODE_MAJOR_VERSION=1
    runTests
fi
