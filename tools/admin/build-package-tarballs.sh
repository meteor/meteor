#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

OUTDIR="$TOPDIR/dist/packages"
mkdir -p $OUTDIR

# A hacky (?) way to pass $ENGINE_VERSION back into build-release.sh.
# Contents set below
if [ -e "$TOPDIR/.package_manifest_chunk" ]; then
  rm "$TOPDIR/.package_manifest_chunk"
fi

cd packages
for PACKAGE in `ls`
do
  if [ -a "$PACKAGE/package.js" ]; then
    cd $PACKAGE
    PACKAGE_VERSION=$($TOPDIR/tools/admin/hash-dir.sh)
    echo "$PACKAGE version $PACKAGE_VERSION"
    tar -c -z -f $OUTDIR/$PACKAGE-$PACKAGE_VERSION.tar.gz .
    cd ..

    # this is used in build-release.sh, which constructs the manifest json.
    echo "    \"$PACKAGE\": \"$PACKAGE_VERSION\"" >> "$TOPDIR/.package_manifest_chunk"
  fi
done
