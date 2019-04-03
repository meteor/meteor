#!/usr/bin/env bash

set -e
set -u

UNAME=$(uname)
ARCH=$(uname -m)
NODE_VERSION=8.15.1
MONGO_VERSION_64BIT=4.0.6
MONGO_VERSION_32BIT=3.2.22
NPM_VERSION=6.9.0

# If we built Node from source on Jenkins, this is the build number.
NODE_BUILD_NUMBER=

if [ "$UNAME" == "Linux" ] ; then
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi

    OS="linux"

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

    OS="osx"

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

if [ "$UNAME" == "Linux" ]
then
    if [ "$ARCH" == "i686" ]
    then
        NODE_TGZ="node-v${NODE_VERSION}-linux-x86.tar.gz"
    elif [ "$ARCH" == "x86_64" ]
    then
        NODE_TGZ="node-v${NODE_VERSION}-linux-x64.tar.gz"
    else
        echo "Unknown architecture: $UNAME $ARCH"
        exit 1
    fi
elif [ "$UNAME" == "Darwin" ]
then
    NODE_TGZ="node-v${NODE_VERSION}-darwin-x64.tar.gz"
else
    echo "Unknown architecture: $UNAME $ARCH"
    exit 1
fi

SCRIPTS_DIR=$(dirname $0)
cd "$SCRIPTS_DIR/.."
CHECKOUT_DIR=$(pwd)

DIR=$(mktemp -d -t generate-dev-bundle-XXXXXXXX)
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

cd "$DIR"
chmod 755 .
umask 022
mkdir build
cd build
