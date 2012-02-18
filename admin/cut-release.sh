#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ..

# Check for MacOS
if [ `uname` != "Darwin" ] ; then
    echo "Meteor only support MacOS X right now."
    exit 1
fi

# increment the version number
export NODE_PATH="$(pwd)/dev_bundle/lib/node_modules"
./dev_bundle/bin/node admin/increment-version.js


./admin/build-release.sh

# get the tarball. XXX copied from build-release.sh
UNAME=$(uname)
ARCH=$(uname -m)
VERSION="$(/usr/local/bin/meteor --version | sed 's/.* //')"
TARBALL=~/meteor-package-${UNAME}-${ARCH}-${VERSION}.tar.gz
test -f "$TARBALL"

# commit to git
echo
echo "//////////////////////"
echo "//////////////////////"
git diff

echo
echo "//////////////////////"
echo "// Commit to git? Press enter to continue. Hit C-c to abort."
read anykey

git commit -a -m "Bump to version $VERSION"
git push origin master

git tag "v$VERSION"
git push origin "v$VERSION"


echo
echo "//////////////////////"

# prompt are you sure
echo "// Result tarball:"
ls -l "$TARBALL"
md5 "$TARBALL"

cat <<EOF
/////////////////////


/////////////////////
// Push release $VERSION ? Press enter to continue. Hit C-c to abort.
/////////////////////
EOF
read

s3cmd -P put "$TARBALL" s3://com.meteor.static
s3cmd -P put ./admin/install-s3.sh s3://com.meteor.static/update/
s3cmd -P put ./admin/manifest.json s3://com.meteor.static/update/

echo
echo "//////////////////////"
echo "// Pushed and live!"
