#!/usr/bin/env bash

set -e
set -u

MONGO_VERSION="2.6.7"

source "$(dirname $0)/build-dev-bundle-common.sh"
echo CHECKOUT DIR IS "$CHECKOUT_DIR"
echo BUILDING MONGO "v$MONGO_VERSION" IN "$DIR"

# Checkout and build mongodb.
# We want to build a binary that includes SSL support but does not depend on a
# particular version of openssl on the host system.

OPENSSL="openssl-1.0.2"
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

# We use Meteor fork since we added some changes to the building script.
# Our patches allow us to link most of the libraries statically.
git clone --branch "ssl-r$MONGO_VERSION" --depth 1 \
    git://github.com/meteor/mongo.git
cd mongo
rm -rf .git

# Compile

MONGO_FLAGS="--ssl --release -j4 "
MONGO_FLAGS+="--cpppath=$DIR/build/openssl-out/include --libpath=$DIR/build/openssl-out/lib "

if [ "$OS" == "osx" ]; then
    # NOTE: '--64' option breaks the compilation, even it is on by default on x64 mac: https://jira.mongodb.org/browse/SERVER-5575
    MONGO_FLAGS+="--openssl=$DIR/build/openssl-out/lib "
    /usr/local/bin/scons $MONGO_FLAGS mongo mongod
elif [ "$OS" == "linux" ]; then
    MONGO_FLAGS+="--no-glibc-check --prefix=./ "
    if [ "$ARCH" == "x86_64" ]; then
      MONGO_FLAGS+="--64"
    fi
    scons $MONGO_FLAGS mongo mongod
else
    echo "We don't know how to compile mongo for this platform"
    exit 1
fi

echo "Done with scons build"

# Copy binaries
mkdir -p "$DIR/mongodb/bin"
cp mongo "$DIR/mongodb/bin/"
cp mongod "$DIR/mongodb/bin/"

# Copy mongodb distribution information
find ./distsrc -maxdepth 1 -type f -exec cp '{}' ../mongodb \;

cd "$DIR"
stripBinary mongodb/bin/mongo
stripBinary mongodb/bin/mongod

echo BUNDLING

cd "$DIR"
rm -rf build
tar czvf "${CHECKOUT_DIR}/mongo_${PLATFORM}_v${MONGO_VERSION}.tar.gz" .

echo DONE
