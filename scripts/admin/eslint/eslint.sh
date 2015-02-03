#!/bin/bash

ORIGDIR=$(pwd)
cd $(dirname $0)
SCRIPTDIR=$(pwd)
cd ../../..
TOPDIR=$(pwd)

INFINITY=10000

cd "$SCRIPTDIR"
${TOPDIR}/dev_bundle/bin/npm install

cd "$TOPDIR"

"${TOPDIR}/dev_bundle/bin/node" \
  "${SCRIPTDIR}/node_modules/.bin/eslint" \
  -c "${SCRIPTDIR}/config.json" \
  "."