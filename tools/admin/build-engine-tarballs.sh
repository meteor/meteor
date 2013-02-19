#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$TMPDIR" >/dev/null 2>&1' 0

# generate engine version: directory hash that depends only on file
# contents but nothing else, eg modification time
echo -n "Computing engine version... "
ENGINE_VERSION=$($TOPDIR/tools/admin/hash-dir.sh)
echo $ENGINE_VERSION

mkdir -p "$TMPDIR/.meteor/engines"
export TARGET_DIR="$TMPDIR/.meteor/engines/$ENGINE_VERSION"
$TOPDIR/tools/admin/build-engine-tree.sh
ln -s "$ENGINE_VERSION" "$TMPDIR/.meteor/engines/latest"
ln -s engines/latest/bin/meteor "$TMPDIR/.meteor/meteor"

# tar it up
OUTDIR="$TOPDIR/dist"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

ENGINE_TARBALL="$OUTDIR/meteor-engine-${ENGINE_VERSION}-${UNAME}-${ARCH}.tar.gz"
echo "Tarring engine to: $ENGINE_TARBALL"
tar -C "$TMPDIR/.meteor/engines" --exclude .meteor/local -czf "$ENGINE_TARBALL" "$ENGINE_VERSION"

ENGINE_BOOTSTRAP_TARBALL="$OUTDIR/meteor-engine-bootstrap-${UNAME}-${ARCH}.tar.gz"
echo "Tarring engine bootstrap to: $ENGINE_BOOTSTRAP_TARBALL"
tar -C "$TMPDIR" --exclude .meteor/local -czf "$ENGINE_BOOTSTRAP_TARBALL" .meteor
