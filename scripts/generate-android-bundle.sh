#!/bin/bash

set -e
set -u

UNAME=$(uname)
ARCH=$(uname -m)
BUNDLE_VERSION="0.1"

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

# save off meteor checkout dir as final target
cd "`dirname "$0"`"/..
CHECKOUT_DIR=`pwd`


DIR=`mktemp -d -t generate-dev-bundle-XXXXXXXX`
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

echo BUILDING IN "$DIR"

cd "$DIR"
chmod 755 .
umask 022


# Download Android SDK
if [ "$UNAME" == "Linux" ]; then
    echo "not sure what to do for linux lol"
    # not guaranteed to have java yikes
else
    curl -O http://dl.google.com/android/android-sdk_r23.0.2-macosx.zip
    unzip android-sdk_r23.0.2-macosx.zip
    rm android-sdk_r23.0.2-macosx.zip

    curl -O http://www.motorlogy.com/apache//ant/binaries/apache-ant-1.9.4-bin.tar.gz
    tar xzf apache-ant-1.9.4-bin.tar.gz
    rm apache-ant-1.9.4-bin.tar.gz

    # the below asks for confirmation... echo y seems to work lol

    # platform tools
    echo y | android-sdk-macosx/tools/android update sdk -t platform-tools -u

    # the platform that cordova likes
    echo y | android-sdk-macosx/tools/android update sdk -t android-19 -u

    # system image for android 19
    echo y | android-sdk-macosx/tools/android update sdk -t sys-img-armeabi-v7a-android-19 --all -u

    # build tools
    echo y | android-sdk-macosx/tools/android update sdk -t "build-tools-20.0.0" -u

    # intel HAXM
    # echo y | android-sdk-macosx/tools/android update sdk -t "extra-intel-Hardware_Accelerated_Execution_Manager" -u
    # android-sdk-macosx/tools/android create avd -t 1 -n test
fi

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt

tar czf "${CHECKOUT_DIR}/android_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE