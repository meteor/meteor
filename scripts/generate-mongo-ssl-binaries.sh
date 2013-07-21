#!/bin/bash
# Run this script on linux box to generate mongodb binaries (most of them, not
# only mongod and mongo) with ssl support and statically linked openssl.
# Optional argument: build directory

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
else
    echo "This script is meant to be run on linux boxes."
    exit 1
fi

PLATFORM="${UNAME}_${ARCH}"

# save off meteor checkout dir as final target
cd `dirname $0`/..
TARGET_DIR=`pwd`

# If optional argument, build directory, is passed, build there.
# Otherwise build in a temporary directory.
if [ $# -eq 0 ]; then
    DIR=`mktemp -d -t generate-dev-bundle-XXXXXXXX`
else
    DIR="$1/`mktemp generate-mongo-ssl-XXXXXXXX`"
    mkdir -p $DIR
fi
#trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

echo BUILDING IN "$DIR"

cd "$DIR"
chmod 755 .
umask 022
mkdir build
cd build

# Checkout and build mongodb.
# We want to build a binary that includes SSL support but does not depend on a
# particular version of openssl on the host system.

cd "$DIR/build"
OPENSSL="openssl-1.0.1e"
OPENSSL_URL="http://www.openssl.org/source/$OPENSSL.tar.gz"
wget $OPENSSL_URL || curl -O $OPENSSL_URL
tar xzf $OPENSSL.tar.gz

cd $OPENSSL
./config --prefix="$DIR/build/openssl-out" no-shared
make install

# To see the mongo changelog, go to http://www.mongodb.org/downloads,
# click 'changelog' under the current version, then 'release notes' in
# the upper right.
cd "$DIR/build"
MONGO_VERSION="2.4.4"

git clone git://github.com/meteor/mongo.git
cd mongo
git checkout ssl-r$MONGO_VERSION

# Compile

MONGO_FLAGS="--ssl --release "
MONGO_FLAGS+="--cpppath $DIR/build/openssl-out/include --libpath $DIR/build/openssl-out/lib "

MONGO_FLAGS+="-j2 --no-glibc-check --prefix=$DIR "
if [ "$ARCH" == "x86_64" ]; then
    MONGO_FLAGS+="--64"
fi
scons $MONGO_FLAGS all || true # It fails on 'all' target but produces the binaries we need

OUT_DIR=mongodb-linux-$ARCH-$MONGOVERSION
mkdir -p $OUTDIR/bin
mv bsondump\
   mongo\
   mongobridge\
   mongod\
   mongodump\
   mongoexport\
   mongofiles\
   mongoimport\
   mongooplog\
   mongoperf\
   mongorestore\
   mongos\
   mongostat\
   mongotop $OUTDIR/bin

# stripBinary $OUTDIR/bin/* # uncomment this if you want to strip all output binaries

echo BUNDLING

tar -czf $OUTDIR.tar.gz $OUTDIR
mv $OUTDIR.tar.gz $DIR

cd "$DIR"

cd "$DIR"
rm -rf build

echo DONE

