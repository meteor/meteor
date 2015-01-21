#!/bin/bash

set -e
set -u

BUNDLE_VERSION="0.1"

# save off meteor checkout dir as final target
cd "`dirname "$0"`"/..
CHECKOUT_DIR=`pwd`

export UNAME=`uname`

DIR=`mktemp -d -t generate-android-bundle-XXXXXXXX`
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

echo BUILDING IN "$DIR"

cd "$DIR"
chmod 755 .
umask 022

# Download Android SDK
if [ "$UNAME" == "Linux" ]; then
    # not guaranteed to have java yikes
    # let's just see if they have it and prompt to install?

    curl -O http://dl.google.com/android/android-sdk_r23.0.2-linux.tgz
    tar xzf android-sdk_r23.0.2-linux.tgz > /dev/null
    rm android-sdk_r23.0.2-linux.tgz

    mv android-sdk-linux android-sdk
else
    curl -O http://dl.google.com/android/android-sdk_r23.0.2-macosx.zip
    unzip android-sdk_r23.0.2-macosx.zip > /dev/null
    rm android-sdk_r23.0.2-macosx.zip

    mv android-sdk-macosx android-sdk
fi

{
    curl -O http://apache.osuosl.org/ant/binaries/apache-ant-1.9.4-bin.tar.gz
    tar xzf apache-ant-1.9.4-bin.tar.gz
    rm apache-ant-1.9.4-bin.tar.gz

    # Capture the license text so we can prompt the user
    echo n | android-sdk/tools/android update sdk -t platform-tools -u > ${CHECKOUT_DIR}/license_cordova_android.txt


    # the below asks for confirmation... echo y seems to work

    # platform tools
    echo y | android-sdk/tools/android update sdk -t platform-tools -u

    # the platform that cordova likes
    echo y | android-sdk/tools/android update sdk -t android-19 -u

    # We now download system images only if needed, before starting the avd
    # system image for android 19 - arm
    #echo y | android-sdk/tools/android update sdk -t sys-img-armeabi-v7a-android-19 --all -u
    # system image for android 19 - x86
    #echo y | android-sdk/tools/android update sdk -t sys-img-x86-android-19 --all -u

    # build tools
    echo y | android-sdk/tools/android update sdk -t "build-tools-20.0.0" -u

    # intel HAXM
    # echo y | android-sdk/tools/android update sdk -t "extra-intel-Hardware_Accelerated_Execution_Manager" -u
    # android-sdk/tools/android create avd -t 1 -n test
} &> /dev/null

# Strip header & footer from license
sed -i '' '1,/License id:/d' ${CHECKOUT_DIR}/license_cordova_android.txt
sed -i '' '1,/------------/d' ${CHECKOUT_DIR}/license_cordova_android.txt
sed -i '' '/Do you accept the license/,$d'  ${CHECKOUT_DIR}/license_cordova_android.txt

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt

echo "going to save in: ${CHECKOUT_DIR}/android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz"
echo "License file is at: ${CHECKOUT_DIR}/license_cordova_android.txt"

tar czf "${CHECKOUT_DIR}/android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz" . &> /dev/null

echo DONE