#!/usr/bin/env bash

INFINITY=10000

TOPDIR=$(pwd)
METEOR_DIR="./code"
cd "$METEOR_DIR"

# Call git grep to find all js files with the appropriate comment tags,
# and only then pass it to JSDoc which will parse the JS files.
# This is a whole lot faster than calling JSDoc recursively.
#
# also run the git grep inside submodules. Possibly these docs should live
# elsewhere, but this works for now
(git grep -al "@summary" \
 && cd packages-for-isopackets/blaze \
 && git grep -al "@summary" | sed -e 's/^/packages-for-isopackets\/blaze\//') \
  | xargs -L ${INFINITY} -t \
    "$TOPDIR/node_modules/.bin/jsdoc" \
    -t "$TOPDIR/jsdoc/docdata-jsdoc-template" \
    -c "$TOPDIR/jsdoc/jsdoc-conf.json" \
    2>&1 | grep -v 'WARNING: JSDoc does not currently handle'
