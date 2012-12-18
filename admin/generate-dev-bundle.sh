#!/bin/bash

set -e
set -u

BUNDLE_VERSION=0.2.12
UNAME=$(uname)
ARCH=$(uname -m)

if [ "$UNAME" == "Linux" ] ; then
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi
    MONGO_OS="linux"

elif [ "$UNAME" == "Darwin" ] ; then
    SYSCTL_64BIT=$(sysctl -n hw.cpu64bit_capable 2>/dev/null || echo 0)
    if [ "$ARCH" == "i386" -a "1" != "$SYSCTL_64BIT" ] ; then
        # some older macos returns i386 but can run 64 bit binaries.
        # Probably should distribute binaries built on these machines,
        # but it should be OK for users to run.
        ARCH="x86_64"
    fi

    if [ "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports x86_64 for now."
        exit 1
    fi

    MONGO_OS="osx"
else
    echo "This OS not yet supported"
    exit 1
fi


# save off meteor checkout dir as final target
cd `dirname $0`/..
TARGET_DIR=`pwd`

DIR=`mktemp -d -t generate-dev-bundle-XXXXXXXX`
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

echo BUILDING IN "$DIR"

cd "$DIR"
chmod 755 .
umask 022
mkdir build
cd build

git clone git://github.com/joyent/node.git
cd node
# When upgrading node versions, also update the values of MIN_NODE_VERSION at
# the top of app/meteor/meteor.js and app/server/server.js.
git checkout v0.8.11

./configure --prefix="$DIR"
make -j4
make install PORTABLE=1
# PORTABLE=1 is a node hack to make npm look relative to itself instead
# of hard coding the PREFIX.

# export path so we use our new node for later builds
export PATH="$DIR/bin:$PATH"

which node

which npm

# When adding new node modules (or any software) to the dev bundle,
# remember to update LICENSE.txt! Also note that we include all the
# packages that these depend on, so watch out for new dependencies when
# you update version numbers.

cd "$DIR/lib/node_modules"
npm install connect@1.9.2 # not 2.x yet. sockjs doesn't work w/ new connect
npm install gzippo@0.1.7
npm install optimist@0.3.5
npm install coffee-script@1.4.0
npm install less@1.3.1
npm install stylus@0.30.1
npm install nib@0.8.2
npm install mime@1.2.7
npm install semver@1.1.0
npm install handlebars@1.0.7
npm install mongodb@1.1.11
npm install uglify-js@1.3.4
npm install clean-css@0.8.3
npm install useragent@1.1.0
npm install request@2.12.0
npm install simplesmtp@0.1.25
npm install stream-buffers@0.2.3
npm install keypress@0.1.0
npm install sockjs@0.3.4
npm install http-proxy@0.8.5
npm install underscore@1.4.2
npm install tar@0.1.14

# progress 0.1.0 has a regression where it opens stdin and thus does not
# allow the node process to exit cleanly. See
# https://github.com/visionmedia/node-progress/issues/19
npm install progress@0.0.5

# pinned at older version. 0.1.16+ uses mimelib, not mimelib-noiconv
# which make the dev bundle much bigger. We need a better solution.
npm install mailcomposer@0.1.15

# Use our version of fstream with a bug fixed.  Also have tar use it.
# See https://github.com/isaacs/fstream/pull/11 .
npm install https://github.com/meteor/fstream/tarball/91c56e7
cd tar/node_modules
npm install https://github.com/meteor/fstream/tarball/91c56e7
cd ../..

# If you update the version of fibers in the dev bundle, also update the "npm
# install" command in docs/client/concepts.html.
npm install fibers@0.6.9
# Fibers ships with compiled versions of its C code for a dozen platforms. This
# bloats our dev bundle, and confuses dpkg-buildpackage and rpmbuild into
# thinking that the packages need to depend on both 32- and 64-bit versions of
# libstd++. Remove all the ones other than our architecture. (Expression based
# on build.js in fibers source.)
FIBERS_ARCH=$(node -p -e 'process.platform + "-" + process.arch + "-v8-" + /[0-9]+\.[0-9]+/.exec(process.versions.v8)[0]')
cd fibers/bin
mv $FIBERS_ARCH ..
rm -rf *
mv ../$FIBERS_ARCH .
cd ../..


# Download and install mongodb.
# To see the mongo changelog, go to http://www.mongodb.org/downloads,
# click 'changelog' under the current version, then 'release notes' in
# the upper right.
cd "$DIR"
MONGO_VERSION="2.2.1"
MONGO_NAME="mongodb-${MONGO_OS}-${ARCH}-${MONGO_VERSION}"
MONGO_URL="http://fastdl.mongodb.org/${MONGO_OS}/${MONGO_NAME}.tgz"
curl "$MONGO_URL" | tar -xz
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop mongooplog mongoperf
cd ../..

# Clean up an unneeded directory accidentally installed by the
# node-mongo-native driver. This will be fixed in later versions, but
# for now we have to manually remove it.
# https://github.com/mongodb/node-mongodb-native/issues/736
rm -rf lib/node_modules/mongodb/.coverage_data


echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${ARCH}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
