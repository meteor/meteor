#!/bin/bash

set -e -x

if [ -z "$METEOR_TOOLS_TREE_DIR" ]; then
    echo "\$METEOR_TOOLS_TREE_DIR must be set"
    exit 1
fi

METEOR="$METEOR_TOOLS_TREE_DIR/bin/meteor"

$METEOR --release release-used-to-test-springboarding | grep "THIS IS A FAKE RELEASE ONLY USED TO TEST ENGINE SPRINGBOARDING"
