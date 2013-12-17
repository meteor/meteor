#!/bin/bash

### Build a tarball for each smart package, which will later be put on
### warehouse.meteor.com. Compute a version for each package by
### hashing its contents. Prepare the packages part of a release
### manifest with each package's version.
###
### At the moment smart packages don't support binary dependencies so
### we don't have to build on different architectures. At some point
### this will change, at which we'll use an approach similar to what
### we do for tools.

set -e
set -u

# cd to top level dir
cd `dirname $0`
cd ../..
export TOPDIR=$(pwd)

OUTDIR="$TOPDIR/dist/packages"
mkdir -p $OUTDIR

# Find a GNU tar, so we can use the --transform flag.
if [ -x "/usr/bin/gnutar" ] ; then
    # Mac.
    GNUTAR=/usr/bin/gnutar
else
    # Linux.
    GNUTAR=tar
fi

# Build all unipackages.
./meteor --get-ready

# A hacky (?) way to pass the release manifest chunk with package
# versions back into build-release.sh.  Contents set below
if [ -e "$TOPDIR/.package_manifest_chunk" ]; then
  rm "$TOPDIR/.package_manifest_chunk"
fi

FIRST_RUN=true # keep track to place commas correctly
cd packages
SORTED_PACKAGE_LIST=$(LC_ALL=C ls) # Ensure consistent order between platforms
for PACKAGE in $SORTED_PACKAGE_LIST
do
  if [ -a "$PACKAGE/package.js" ]; then
    if [ $FIRST_RUN == false ]; then
      echo "," >> "$TOPDIR/.package_manifest_chunk"
    fi

    PACKAGE_VERSION=$(perl -pe 's/\Q$ENV{TOPDIR}\E//g; s/os\..*\.json/os.json/g' $PACKAGE/.build/buildinfo.json | shasum | cut -c 1-10)
    echo "$PACKAGE version $PACKAGE_VERSION"
    ROOTDIR="$PACKAGE-${PACKAGE_VERSION}-${PLATFORM}"
    TARBALL="$OUTDIR/$PACKAGE-${PACKAGE_VERSION}-${PLATFORM}.tar.gz"

    # Create the tarball from the built package. In the tarball, the root
    # directory should be $ROOTDIR, so we replace the "." with that, using
    # --transform (a GNU tar extension). Leave out the buildinfo.json file,
    # which contains local paths and is only used to decide if we should rebuild
    # a package from its corresponding source tree.
    "$GNUTAR" czf "$TARBALL" -C "$PACKAGE/.build" --exclude buildinfo.json --transform 's/^\./'"$ROOTDIR"'/' .

    # this is used in build-release.sh, which constructs the release json.
    echo -n "    \"$PACKAGE\": \"$PACKAGE_VERSION\"" >> "$TOPDIR/.package_manifest_chunk"
    FIRST_RUN=false
  fi
done

# Add one newline at the end
echo >> "$TOPDIR/.package_manifest_chunk"
