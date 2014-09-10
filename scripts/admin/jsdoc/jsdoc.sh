#!/bin/bash

ORIGDIR=$(pwd)
cd $(dirname $0)
cd ../../..
TOPDIR=$(pwd)

INFINITY=10000

cd $TOPDIR

git grep -al "@summary" | xargs -L ${INFINITY} -t \
    ${TOPDIR}/dev_bundle/bin/node \
    ${TOPDIR}/dev_bundle/lib/node_modules/.bin/jsdoc \
    -t "${TOPDIR}/scripts/admin/jsdoc/docdata-jsdoc-template" \
    -c "${TOPDIR}/scripts/admin/jsdoc/jsdoc-conf.json"