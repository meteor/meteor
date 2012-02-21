#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ..
TOPDIR=$(pwd)

UNAME=$(uname)
ARCH=$(uname -m)

# make sure we're clean
# http://stackoverflow.com/questions/2657935/checking-for-a-dirty-index-or-untracked-files-with-git
function warn_and_exit { echo $1 ; return 1; }
git diff-files --quiet || \
    warn_and_exit "Local changes. Aborting."
git diff-index --quiet --cached HEAD || \
    warn_and_exit "Local changes staged. Aborting."
test -z "$(git ls-files --others --exclude-standard)" || \
    warn_and_exit "Uncommitted files. Aborting."

# Make sure we have an up to date dev bundle by re-downloading.
for i in dev_bundle_*.tar.gz ; do
    test -f $i && warn_and_exit "Local dev_bundle tarball. Aborting."
done
if [ -d dev_bundle ] ; then
    echo "Removing old dev_bundle."
    rm -rf dev_bundle
fi

# Force dev_bundle re-creation
./meteor --version || \
    warn_and_exit "dev_bundle installation failed."

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

fi