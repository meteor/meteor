#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

ENGINE_TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$ENGINE_TMPDIR" >/dev/null 2>&1' 0

# build the engine in a temporary directory. after its built we know
# its version so rename the directory.
mkdir -p "$ENGINE_TMPDIR/.meteor/engines"
export TARGET_DIR="$ENGINE_TMPDIR/.meteor/engines/new"
$TOPDIR/tools/admin/build-engine-tree.sh
ENGINE_VERSION=$(cat $TARGET_DIR/.engine_version.txt)
mv "$TARGET_DIR" "$ENGINE_TMPDIR/.meteor/engines/$ENGINE_VERSION"

ln -s "$ENGINE_VERSION" "$ENGINE_TMPDIR/.meteor/engines/latest"
ln -s engines/latest/bin/meteor "$ENGINE_TMPDIR/.meteor/meteor"

# tar it up
OUTDIR="$TOPDIR/dist/engine"
mkdir -p "$OUTDIR"

ENGINE_TARBALL="$OUTDIR/meteor-engine-${ENGINE_VERSION}-${UNAME}-${ARCH}.tar.gz"
echo "Tarring engine to: $ENGINE_TARBALL"
tar -C "$ENGINE_TMPDIR/.meteor/engines" --exclude .meteor/local -czf "$ENGINE_TARBALL" "$ENGINE_VERSION"

ENGINE_BOOTSTRAP_TARBALL="$OUTDIR/meteor-engine-bootstrap-${UNAME}-${ARCH}.tar.gz"
echo "Tarring engine bootstrap to: $ENGINE_BOOTSTRAP_TARBALL"
tar -C "$ENGINE_TMPDIR" --exclude .meteor/local -czf "$ENGINE_BOOTSTRAP_TARBALL" .meteor

# A hacky (?) way to pass $ENGINE_VERSION back into build-release.sh
echo $ENGINE_VERSION > $TOPDIR/.engine_version
