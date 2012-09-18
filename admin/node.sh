#!/bin/bash

ORIGDIR=$(pwd)
cd $(dirname $0)
cd ..
TOPDIR=$(pwd)

# download dev bundle if we don't have it already
if [ ! -d dev_bundle ] ; then
    ./meteor --version
fi

cd "$ORIGDIR"
export NODE_PATH="$TOPDIR/dev_bundle/lib/node_modules"
exec "$TOPDIR/dev_bundle/bin/node" "$@"
