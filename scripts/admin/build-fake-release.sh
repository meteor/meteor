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

FAKE_TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$FAKE_TMPDIR" >/dev/null 2>&1' 0

# install it.
echo "Building a fake release in $FAKE_TMPDIR."

# Make sure dev bundle exists.
./meteor --version 2>&1 | grep Unreleased

# Start out with just the dev bundle.
cp -a dev_bundle "$FAKE_TMPDIR/meteor"
# ... but not the mongodb build, or some of the larger modules that we
# definitely don't use to find engine.
GOOD_MODULES="kexec underscore fibers shell-quote"
rm -rf "$FAKE_TMPDIR/meteor/mongodb"
pushd "$FAKE_TMPDIR/meteor/lib/node_modules"
for m in $GOOD_MODULES; do
  mv $m ..
done
rm -rf *
for m in $GOOD_MODULES; do
  mv ../$m .
done
popd

# Copy post-upgrade script to where it is expected.
mkdir -p "$FAKE_TMPDIR/meteor/app/meteor"
cp "$TOPDIR/scripts/admin/initial-engine-post-upgrade.js" \
   "$FAKE_TMPDIR/meteor/app/meteor/post-upgrade.js"

# Copy in meteor-bootstrap.sh, which will become the installed
# /usr/local/bin/meteor.
cp "$TOPDIR/scripts/admin/meteor-bootstrap.sh" \
   "$FAKE_TMPDIR/meteor/app/meteor/meteor-bootstrap.sh"

OUTDIR="$TOPDIR/dist"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"
TARBALL="$OUTDIR/meteor-package-${UNAME}-${ARCH}-${VERSION}.tar.gz"
echo "Tarring to: $TARBALL"

tar -C "$FAKE_TMPDIR" --exclude .meteor/local -czf "$TARBALL" meteor


if [ "$UNAME" == "Linux" ] ; then
    echo "Building debian package"
    DEBDIR="$FAKE_TMPDIR/debian"
    mkdir "$DEBDIR"
    cd "$DEBDIR"
    cp "$TARBALL" "meteor_${VERSION}.orig.tar.gz"
    mkdir "meteor-${VERSION}"
    cd "meteor-${VERSION}"
    cp -r "$TOPDIR/scripts/admin/debian" .
    export TARBALL
    dpkg-buildpackage
    cp ../*.deb "$OUTDIR"


    echo "Building RPM"
    RPMDIR="$FAKE_TMPDIR/rpm"
    mkdir $RPMDIR
    rpmbuild -bb --define="TARBALL $TARBALL" \
        --define="_topdir $RPMDIR" "$TOPDIR/scripts/admin/meteor.spec"
    cp $RPMDIR/RPMS/*/*.rpm "$OUTDIR"
fi
