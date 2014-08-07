#!/bin/bash

set -e
set -u

for UNAME in Linux Darwin; do
    ARCH=$(uname -m)
    BUNDLE_VERSION="0.1"

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
        # let's just see if they have it and prompt to install?

        curl -O http://dl.google.com/android/android-sdk_r23.0.2-linux.tgz
        tar xzf android-sdk_r23.0.2-linux.tgz
        rm android-sdk_r23.0.2-linux.tgz

        mv android-sdk-linux android-sdk
    else
        curl -O http://dl.google.com/android/android-sdk_r23.0.2-macosx.zip
        unzip android-sdk_r23.0.2-macosx.zip
        rm android-sdk_r23.0.2-macosx.zip

        mv android-sdk-macosx android-sdk
    fi

    curl -O http://www.motorlogy.com/apache//ant/binaries/apache-ant-1.9.4-bin.tar.gz
    tar xzf apache-ant-1.9.4-bin.tar.gz
    rm apache-ant-1.9.4-bin.tar.gz

    # the below asks for confirmation... echo y seems to work lol

    # platform tools
    echo y | android-sdk/tools/android update sdk -t platform-tools -u

    # the platform that cordova likes
    echo y | android-sdk/tools/android update sdk -t android-19 -u

    # system image for android 19
    echo y | android-sdk/tools/android update sdk -t sys-img-armeabi-v7a-android-19 --all -u

    # build tools
    echo y | android-sdk/tools/android update sdk -t "build-tools-20.0.0" -u

    # intel HAXM
    # echo y | android-sdk/tools/android update sdk -t "extra-intel-Hardware_Accelerated_Execution_Manager" -u
    # android-sdk/tools/android create avd -t 1 -n test

    echo BUNDLING

    cd "$DIR"
    echo "${BUNDLE_VERSION}" > .bundle_version.txt

    tar czf "${CHECKOUT_DIR}/android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz" .

    echo DONE

done