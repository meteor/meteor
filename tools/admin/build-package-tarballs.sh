#!/bin/bash

### Build a tarball for each smart package, which will later be put on
### warehouse.meteor.com. Compute a version for each package by
### hashing its contents. Prepare the packages part of a release
### manifest with each package's version.
###
### At the moment smart packages don't support binary dependencies so
### we don't have to build on different architectures. At some point
### this will change, at which we'll use an approach similar to what
### we do for engines.

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

FIRST_RUN=true # keep track to place commas correctly
cd packages
for PACKAGE in *
do
  if [ -a "$PACKAGE/package.js" ]; then
    if [ $FIRST_RUN == false ]; then
      echo "," >> "$TOPDIR/.package_manifest_chunk"
    fi

    cd $PACKAGE
    PACKAGE_VERSION=$($TOPDIR/tools/admin/hash-dir.sh)
    echo "$PACKAGE version $PACKAGE_VERSION"
    tar -c -z -f $OUTDIR/$PACKAGE-$PACKAGE_VERSION.tar.gz .
    cd ..

    # this is used in build-release.sh, which constructs the manifest json.
    echo -n "    \"$PACKAGE\": \"$PACKAGE_VERSION\"" >> "$TOPDIR/.package_manifest_chunk"
    FIRST_RUN=false
  fi
done

# Add one newline at the end
echo >> "$TOPDIR/.package_manifest_chunk"
