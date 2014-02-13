#!/usr/bin/env bash

set -e -x

if [ -z "$METEOR_TOOLS_TREE_DIR" ]; then
    echo "\$METEOR_TOOLS_TREE_DIR must be set"
    exit 1
fi

METEOR="$METEOR_TOOLS_TREE_DIR/bin/meteor"

# This release was built from the
# 'release/release-used-to-test-springboarding' tag in GitHub. All it
# does is print this string and exit.
$METEOR --release release-used-to-test-springboarding | grep "THIS IS A FAKE RELEASE ONLY USED TO TEST ENGINE SPRINGBOARDING"
