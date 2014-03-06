#!/bin/bash

set -e
set -u

UNAME=$(uname)
ARCH=$(uname -m)

if [ "$UNAME" == "Linux" ] ; then
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi

    MONGO_OS="linux"

    stripBinary() {
        strip --remove-section=.comment --remove-section=.note $1
    }
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

    # We don't strip on Mac because we don't know a safe command. (Can't strip
    # too much because we do need node to be able to load objects like
    # fibers.node.)
    stripBinary() {
        true
    }
else
    echo "This OS not yet supported"
    exit 1
fi

PLATFORM="${UNAME}_${ARCH}"

# save off meteor checkout dir as final target
cd `dirname $0`/..
TARGET_DIR=`pwd`

# Read the bundle version from the meteor shell script.
BUNDLE_VERSION=$(perl -ne 'print $1 if /BUNDLE_VERSION=(\S+)/' meteor)
if [ -z "$BUNDLE_VERSION" ]; then
    echo "BUNDLE_VERSION not found"
    exit 1
fi
echo "Building dev bundle $BUNDLE_VERSION"

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
# the top of tools/meteor.js and tools/server/boot.js, and the text in
# docs/client/concepts.html and the README in tools/bundler.js.
git checkout v0.10.25

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
npm install semver@2.2.1
npm install request@2.33.0
npm install keypress@0.2.1
npm install underscore@1.5.2
npm install fstream@0.1.25
npm install tar@0.1.19
npm install kexec@0.2.0
npm install source-map@0.1.32
npm install source-map-support@0.2.5
npm install bcrypt@0.7.7
npm install heapdump@0.2.5

# Fork of 1.0.2 with https://github.com/nodejitsu/node-http-proxy/pull/592
npm install https://github.com/meteor/node-http-proxy/tarball/99f757251b42aeb5d26535a7363c96804ee057f0

# Using the unreleased 1.1 branch. We can probably switch to a built NPM version
# when it gets released.
npm install https://github.com/ariya/esprima/tarball/5044b87f94fb802d9609f1426c838874ec2007b3

# 2.4.0 (more or less, the package.json change isn't committed) plus our PR
# https://github.com/williamwicks/node-eachline/pull/4
npm install https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da

# If you update the version of fibers in the dev bundle, also update the "npm
# install" command in docs/client/concepts.html and in the README in
# tools/bundler.js.
npm install fibers@1.0.1
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

# Checkout and build mongodb.
# We want to build a binary that includes SSL support but does not depend on a
# particular version of openssl on the host system.

cd "$DIR/build"
OPENSSL="openssl-1.0.1f"
OPENSSL_URL="http://www.openssl.org/source/$OPENSSL.tar.gz"
wget $OPENSSL_URL || curl -O $OPENSSL_URL
tar xzf $OPENSSL.tar.gz

cd $OPENSSL
if [ "$UNAME" == "Linux" ]; then
    ./config --prefix="$DIR/build/openssl-out" no-shared
else
    # This configuration line is taken from Homebrew formula:
    # https://github.com/mxcl/homebrew/blob/master/Library/Formula/openssl.rb
    ./Configure no-shared zlib-dynamic --prefix="$DIR/build/openssl-out" darwin64-x86_64-cc enable-ec_nistp_64_gcc_128
fi
make install

# To see the mongo changelog, go to http://www.mongodb.org/downloads,
# click 'changelog' under the current version, then 'release notes' in
# the upper right.
cd "$DIR/build"
MONGO_VERSION="2.4.9"

# We use Meteor fork since we added some changes to the building script.
# Our patches allow us to link most of the libraries statically.
git clone git://github.com/meteor/mongo.git
cd mongo
git checkout ssl-r$MONGO_VERSION

# Compile

MONGO_FLAGS="--ssl --release -j4 "
MONGO_FLAGS+="--cpppath $DIR/build/openssl-out/include --libpath $DIR/build/openssl-out/lib "

if [ "$MONGO_OS" == "osx" ]; then
    # NOTE: '--64' option breaks the compilation, even it is on by default on x64 mac: https://jira.mongodb.org/browse/SERVER-5575
    MONGO_FLAGS+="--openssl $DIR/build/openssl-out/lib "
    /usr/local/bin/scons $MONGO_FLAGS mongo mongod
elif [ "$MONGO_OS" == "linux" ]; then
    MONGO_FLAGS+="--no-glibc-check --prefix=./ "
    if [ "$ARCH" == "x86_64" ]; then
      MONGO_FLAGS+="--64"
    fi
    scons $MONGO_FLAGS mongo mongod
else
    echo "We don't know how to compile mongo for this platform"
    exit 1
fi

# Copy binaries
mkdir -p "$DIR/mongodb/bin"
cp mongo "$DIR/mongodb/bin/"
cp mongod "$DIR/mongodb/bin/"

# Copy mongodb distribution information
find ./distsrc -maxdepth 1 -type f -exec cp '{}' ../mongodb \;

cd "$DIR"
stripBinary bin/node
stripBinary mongodb/bin/mongo
stripBinary mongodb/bin/mongod

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
