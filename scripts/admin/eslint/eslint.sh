#!/usr/bin/env bash

ORIGDIR=$(pwd)
cd $(dirname $0)
SCRIPTDIR=$(pwd)
cd ../../..
TOPDIR=$(pwd)

INFINITY=10000

cd "$SCRIPTDIR"
${TOPDIR}/dev_bundle/bin/npm install

cd "$TOPDIR"

files_to_lint="."
if [ "$1" == "modified" ]; then
  files_to_lint=$(git diff --cached --name-only --diff-filter=ACM \
                  | grep '\.js$')
fi

if [ -n "$files_to_lint" ]; then
  "${TOPDIR}/dev_bundle/bin/node" \
    "${SCRIPTDIR}/node_modules/.bin/eslint" \
    --quiet \
    -c "${SCRIPTDIR}/.eslintrc" \
    $files_to_lint
fi
