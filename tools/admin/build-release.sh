#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ../..
TOPDIR=$(pwd)

OUTDIR="$TOPDIR/dist"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

tools/admin/build-engine-tarballs.sh
ENGINE_VERSION=$(cat "$TOPDIR/.engine_version")
tools/admin/build-package-tarballs.sh
MANIFEST_PACKAGE_CHUNK=$(cat "$TOPDIR/.package_manifest_chunk")

# don't keep these around since they get outdated
rm "$TOPDIR/.engine_version"
rm "$TOPDIR/.package_manifest_chunk"

cat > "$OUTDIR/manifest.json" <<ENDOFMANIFEST
{
  "engine": "$ENGINE_VERSION",
  "packages": {
$MANIFEST_PACKAGE_CHUNK
  }
}
ENDOFMANIFEST

cat "$OUTDIR/manifest.json"
