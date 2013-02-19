#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

cd packages
for PACKAGE in `ls`
do
  if [ -a "$PACKAGE/package.js" ]; then
    cd $PACKAGE
    PACKAGE_VERSION=$($TOPDIR/tools/admin/hash-dir.sh)
    echo $PACKAGE version $PACKAGE_VERSION
    tar -c -z -f $TOPDIR/dist/$PACKAGE-$PACKAGE_VERSION.tar.gz .
    cd ..
  fi
done
