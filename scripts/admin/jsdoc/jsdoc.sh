#!/bin/bash

ORIGDIR=$(pwd)
cd $(dirname $0)
SCRIPTDIR=$(pwd)
cd ../../..
TOPDIR=$(pwd)

INFINITY=10000

cd "$SCRIPTDIR"
${TOPDIR}/dev_bundle/bin/npm install

cd "$ORIGDIR"
# Call git grep to find all js files with the appropriate comment tags,
# and only then pass it to JSDoc which will parse the JS files.
# This is a whole lot faster than calling JSDoc recursively.
git grep -al "@summary" | xargs -L ${INFINITY} -t \
    "${TOPDIR}/dev_bundle/bin/node" \
    "${SCRIPTDIR}/node_modules/.bin/jsdoc" \
    -t "${TOPDIR}/scripts/admin/jsdoc/docdata-jsdoc-template" \
    -c "${TOPDIR}/scripts/admin/jsdoc/jsdoc-conf.json"
