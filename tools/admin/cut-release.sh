#!/bin/bash

set -e

# XXX
echo "This script is currently broken and does not represent the new release procedure. Don't use it!"
exit 1

# cd to top level dir
cd `dirname $0`
cd ..

# Check for MacOS
if [ `uname` != "Darwin" ] ; then
    echo "Meteor release script must run on MacOS."
    exit 1
fi

# make sure we're clean
# http://stackoverflow.com/questions/2657935/checking-for-a-dirty-index-or-untracked-files-with-git
function warn_and_exit { echo $1 ; return 1; }
git diff-files --quiet || \
    warn_and_exit "Local changes. Aborting."
git diff-index --quiet --cached HEAD || \
    warn_and_exit "Local changes staged. Aborting."
test -z "$(git ls-files --others --exclude-standard)" || \
    warn_and_exit "Uncommitted files. Aborting."

for i in dev_bundle_*.tar.gz ; do
    test -f $i && warn_and_exit "Local dev_bundle tarball. Aborting."
done

# Make sure we have an up to date dev bundle by re-downloading.
if [ -d dev_bundle ] ; then
    echo "Removing old dev_bundle."
    rm -rf dev_bundle
fi
# Force dev_bundle re-creation
./meteor --version || \
    warn_and_exit "dev_bundle installation failed."


# increment the version number
export NODE_PATH="$(pwd)/dev_bundle/lib/node_modules"
./dev_bundle/bin/node admin/increment-version.js


./admin/build-release.sh

# get the tarball. XXX copied from build-release.sh
UNAME=$(uname)
ARCH=$(uname -m)
VERSION="$(/usr/local/bin/meteor --version | perl -pe 's/.+ ([^ \(]+)( \(.+\))*/$1/')"
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
