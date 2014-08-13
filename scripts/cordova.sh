#!/bin/bash

# Find the script dir, following one level of symlink. Note that symlink
# can be relative or absolute. Too bad 'readlink -f' is not portable.
ORIG_DIR=$(pwd)
cd "$(dirname "$0")"
if [ -L "$(basename "$0")" ] ; then
    cd "$(dirname $(readlink $(basename "$0") ) )"
fi
SCRIPT_DIR=$(pwd -P)/..
cd "$ORIG_DIR"

ANDROID_BUNDLE="$SCRIPT_DIR/android_bundle"
DEV_BUNDLE="$SCRIPT_DIR/dev_bundle"

# add android stuff
export PATH=${ANDROID_BUNDLE}/android-sdk/tools:${ANDROID_BUNDLE}/android-sdk/platform-tools:${PATH}

# add ant
export ANT_HOME=${ANDROID_BUNDLE}/apache-ant-1.9.4
export PATH=${ANT_HOME}/bin:${PATH}

# add node
export PATH=${DEV_BUNDLE}/bin:${PATH}

command -v javac >/dev/null 2>&1 || {
  echo >&2 "To add the android platform, please install a JDK. Here are some directions: http://openjdk.java.net/install/"; exit 1;
}

# create avd if necessary
if [[ ! $(${ANDROID_BUNDLE}/android-sdk/tools/android list avd | grep -q Name) ]] ; then
  echo -e "\n" | ${ANDROID_BUNDLE}/android-sdk/tools/android create avd --target 1 --name meteor --abi default/armeabi-v7a --path ${ANDROID_BUNDLE}/meteor_avd/ 1>&2
fi

export NODE_PATH="${DEV_BUNDLE}/lib/node_modules"

exec ${DEV_BUNDLE}/lib/node_modules/cordova/bin/cordova "$@"

