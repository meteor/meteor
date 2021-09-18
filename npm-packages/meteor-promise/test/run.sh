#!/usr/bin/env bash

set -e
set -u

mocha \
    --harmony \
    --reporter spec \
    --full-trace \
    test/tests.js

USE_GLOBAL_PROMISE=1 \
mocha \
    --harmony \
    --reporter spec \
    --full-trace \
    test/tests.js
