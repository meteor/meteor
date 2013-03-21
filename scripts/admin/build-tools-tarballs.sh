#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

TOOLS_TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$TOOLS_TMPDIR" >/dev/null 2>&1' 0

# build the tools in a temporary directory. after its built we know
# its version so rename the directory.
mkdir -p "$TOOLS_TMPDIR/.meteor/tools"
export TARGET_DIR="$TOOLS_TMPDIR/.meteor/tools/new"
$TOPDIR/scripts/admin/build-tools-tree.sh
TOOLS_VERSION=$(cat $TARGET_DIR/.tools_version.txt)
mv "$TARGET_DIR" "$TOOLS_TMPDIR/.meteor/tools/$TOOLS_VERSION"
# The actual tools part should be unwritable.
chmod -R a-w "$TOOLS_TMPDIR/.meteor/tools/$TOOLS_VERSION"

ln -s "$TOOLS_VERSION" "$TOOLS_TMPDIR/.meteor/tools/latest"
ln -s tools/latest/bin/meteor "$TOOLS_TMPDIR/.meteor/meteor"

# tar it up
OUTDIR="$TOPDIR/dist/tools"
mkdir -p "$OUTDIR"

TOOLS_TARBALL="$OUTDIR/meteor-tools-${TOOLS_VERSION}-${UNAME}-${ARCH}.tar.gz"
echo "Tarring tools to: $TOOLS_TARBALL"
tar -C "$TOOLS_TMPDIR/.meteor/tools" --exclude .meteor/local -czf "$TOOLS_TARBALL" "$TOOLS_VERSION"

TOOLS_BOOTSTRAP_TARBALL="$OUTDIR/meteor-tools-bootstrap-${UNAME}-${ARCH}.tar.gz"
echo "Tarring tools bootstrap to: $TOOLS_BOOTSTRAP_TARBALL"
tar -C "$TOOLS_TMPDIR" --exclude .meteor/local -czf "$TOOLS_BOOTSTRAP_TARBALL" .meteor

# A hacky (?) way to pass $TOOLS_VERSION back into build-release.sh
echo $TOOLS_VERSION > $TOPDIR/.tools_version
