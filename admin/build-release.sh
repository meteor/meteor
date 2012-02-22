#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

echo "Installing."

# install it.
./install.sh

# get the version number.
VERSION="$(/usr/local/bin/meteor --version | sed 's/.* //')"

# tar it up
TARBALL=~/meteor-package-${UNAME}-${ARCH}-${VERSION}.tar.gz
echo "Tarring to: $TARBALL"

tar -C /usr/local --exclude .meteor/local -czf "$TARBALL" meteor


if [ "$UNAME" == "Linux" ] ; then
    echo "Building debian package"
    DEBDIR=$(mktemp -d)
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
    rpmbuild -bb --define="TARBALL $TARBALL" "$TOPDIR/admin/meteor.spec"

    # XXX
    cp ~/rpmbuild/RPMS/*/*.rpm ~


fi
