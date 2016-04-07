#!/usr/bin/env bash

cd $(dirname $0)
TEST_DIR=$(pwd)

BABEL_CACHE_DIR=${TEST_DIR}/.cache
export BABEL_CACHE_DIR

mocha \
    --reporter spec \
    --full-trace \
    --require ../runtime.js \
    --compilers js:${TEST_DIR}/register.js \
    tests.js
