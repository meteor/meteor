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

# Node, in its infinite wisdom, creates some hard links in some of its binary
# output (eg, kexec.node). These hard links are across directories. Some
# filesystems (eg, AFS) don't support hard links across directories, so make
# sure that on Linux, our tarballs don't have hard links. (Why only on Linux?
# Because neither /usr/bin/tar nor /usr/bin/gnutar on Mac appear to have this
# flag or an equivalent. And we don't care too much about AFS support on Mac
# anyway.)
if [ "$UNAME" = "Linux" ]; then
  TAR="tar --hard-dereference"
else
  TAR=tar
fi
export TAR


scripts/admin/build-tools-tarballs.sh
TOOLS_VERSION=$(cat "$TOPDIR/.tools_version")
scripts/admin/build-package-tarballs.sh
MANIFEST_PACKAGE_CHUNK=$(cat "$TOPDIR/.package_manifest_chunk")

# don't keep these around since they get outdated
rm "$TOPDIR/.tools_version"
rm "$TOPDIR/.package_manifest_chunk"

cat > "$OUTDIR/release.json-$PLATFORM" <<ENDOFMANIFEST
{
  "tools": "$TOOLS_VERSION",
  "packages": {
$MANIFEST_PACKAGE_CHUNK
  },
  "upgraders": ["app-packages"]
}
ENDOFMANIFEST

cat "$OUTDIR/release.json-$PLATFORM"
