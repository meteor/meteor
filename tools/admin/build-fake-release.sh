#!/bin/bash

# Builds a tarball that can be downloaded by pre-engine "meteor update" to
# bootstrap us into engine-land.

# Must be greater than the latest non-engine version.
VERSION="0.6.0"

set -e
set -u

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$TMPDIR" >/dev/null 2>&1' 0

# install it.
echo "Building a fake release in $TMPDIR."

# Make sure dev bundle exists.
./meteor --version || exit 1

# Start out with just the dev bundle.
cp -a dev_bundle "$TMPDIR/meteor"

# Copy post-upgrade script to where it is expected.
mkdir -p "$TMPDIR/meteor/app/meteor"
cp "$TOPDIR/tools/admin/initial-engine-post-upgrade.js" \
   "$TMPDIR/meteor/app/meteor/post-upgrade.js"

# Copy in meteor-bootstrap.sh, which will become the installed
# /usr/local/bin/meteor.
cp "$TOPDIR/tools/admin/meteor-bootstrap.sh" \
   "$TMPDIR/meteor/app/meteor/meteor-bootstrap.sh"

OUTDIR="$TOPDIR/dist"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"
TARBALL="$OUTDIR/meteor-package-${UNAME}-${ARCH}-${VERSION}.tar.gz"
echo "Tarring to: $TARBALL"

tar -C "$TMPDIR" --exclude .meteor/local -czf "$TARBALL" meteor
