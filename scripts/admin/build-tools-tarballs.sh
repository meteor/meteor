#!/bin/bash

set -e
set -u

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

TOOLS_TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$TOOLS_TMPDIR" >/dev/null 2>&1' 0

# build the tools in a temporary directory. after its built we know
# its version so rename the directory.
export TARGET_DIR="$TOOLS_TMPDIR/new"
$TOPDIR/scripts/admin/build-tools-tree.sh
TOOLS_VERSION=$(cat $TARGET_DIR/.tools_version.txt)
mv "$TARGET_DIR" "$TOOLS_TMPDIR/$TOOLS_VERSION"

# tar it up
OUTDIR="$TOPDIR/dist/tools"
mkdir -p "$OUTDIR"

TOOLS_TARBALL="$OUTDIR/meteor-tools-${TOOLS_VERSION}-${PLATFORM}.tar.gz"
echo "Tarring tools to: $TOOLS_TARBALL"
$TAR -C "$TOOLS_TMPDIR" --exclude .meteor/local -czf "$TOOLS_TARBALL" "$TOOLS_VERSION"

# A hacky (?) way to pass $TOOLS_VERSION back into build-release.sh
echo $TOOLS_VERSION > $TOPDIR/.tools_version
