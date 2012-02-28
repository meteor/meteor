#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
trap 'rm -rf "$TMPDIR" >/dev/null 2>&1' 0

# install it.
echo "Installing."

export PREFIX="$TMPDIR/install"
mkdir -p "$PREFIX"
./install.sh

# get the version number.
VERSION="$($PREFIX/bin/meteor --version | sed 's/.* //')"

# tar it up
TARBALL=~/meteor-package-${UNAME}-${ARCH}-${VERSION}.tar.gz
echo "Tarring to: $TARBALL"

tar -C "$PREFIX" --exclude .meteor/local -czf "$TARBALL" meteor


if [ "$UNAME" == "Linux" ] ; then
    echo "Building debian package"
    DEBDIR="TMPDIR/debian"
    mkdir "$DEBDIR"
    cd "$DEBDIR"
    cp "$TARBALL" "meteor_${VERSION}.orig.tar.gz"
    mkdir "meteor-${VERSION}"
    cd "meteor-${VERSION}"
    cp -r "$TOPDIR/admin/debian" .
    export TARBALL
    dpkg-buildpackage

    # XXX!
    cp ../*.deb ~


    echo "Building RPM"
    # XXX how to set rpm build dir to not be ~/rpmbuild
    rpmbuild -bb --define="TARBALL $TARBALL" "$TOPDIR/admin/meteor.spec"

    # XXX
    cp ~/rpmbuild/RPMS/*/*.rpm ~

fi
