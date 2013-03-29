#!/bin/bash

set -e
set -u

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

OUTDIR="$TOPDIR/dist"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

UNAME=$(uname)
ARCH=$(uname -m)
export PLATFORM="${UNAME}_${ARCH}"



scripts/admin/build-tools-tarballs.sh
TOOLS_VERSION=$(cat "$TOPDIR/.tools_version")
scripts/admin/build-package-tarballs.sh
MANIFEST_PACKAGE_CHUNK=$(cat "$TOPDIR/.package_manifest_chunk")

# don't keep these around since they get outdated
rm "$TOPDIR/.tools_version"
rm "$TOPDIR/.package_manifest_chunk"

cat > "$OUTDIR/release.json" <<ENDOFMANIFEST
{
  "tools": "$TOOLS_VERSION",
  "packages": {
$MANIFEST_PACKAGE_CHUNK
  }
}
ENDOFMANIFEST

cat "$OUTDIR/release.json"
