#!/bin/bash

ORIGDIR=$(pwd)
cd $(dirname $0)
cd ../../..
TOPDIR=$(pwd)

cd $TOPDIR

${TOPDIR}/dev_bundle/lib/node_modules/.bin/jsdoc \
  -t "${TOPDIR}/scripts/admin/jsdoc/docdata-jsdoc-template" \
  -c "${TOPDIR}/scripts/admin/jsdoc/jsdoc-conf.json" \
  -r "${TOPDIR}/packages/"