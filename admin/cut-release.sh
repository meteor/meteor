#!/bin/bash

set -e

# cd to top level dir
cd `dirname $0`
cd ..

# Check for MacOS
if [ `uname` != "Darwin" ] ; then
    echo "Skybreak only support MacOS X right now."
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

# Make sure we have an up to date dev bundle by re-downloading.
for i in dev_bundle_*.tar.gz ; do
    test -f $i && warn_and_exit "Local dev_bundle tarball. Aborting."
done
if [ -d dev_bundle ] ; then
    echo "Removing old dev_bundle."
    rm -rf dev_bundle
fi

# Force dev_bundle re-creation
./skybreak --version || \
    warn_and_exit "dev_bundle installation failed."


# increment the version number
export NODE_PATH="$(pwd)/dev_bundle/lib/node_modules"
./dev_bundle/bin/node admin/increment-version.js

echo "Installing."

# install it.
./install.sh

# get the version number.
VERSION="$(/usr/local/bin/skybreak --version | sed 's/.* //')"

# tar it up
TARBALL=~/skybreak-package-${VERSION}.tar.gz
echo "Tarring to: $TARBALL"

tar -C /usr/local --exclude .skybreak/local -czf "$TARBALL" skybreak

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

s3cmd -P put "$TARBALL" s3://com.skybreakplatform.static
s3cmd -P put ./admin/install-s3.sh s3://com.skybreakplatform.static/update/
s3cmd -P put ./admin/manifest.json s3://com.skybreakplatform.static/update/

echo
echo "//////////////////////"
echo "// Pushed and live!"
