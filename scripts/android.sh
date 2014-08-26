#!/bin/bash

# Find the script dir, following one level of symlink. Note that symlink
# can be relative or absolute. Too bad 'readlink -f' is not portable.
ORIG_DIR=$(pwd)
cd "$(dirname "$0")"
if [ -L "$(basename "$0")" ] ; then
    cd "$(dirname $(readlink $(basename "$0") ) )"
fi
SCRIPT_DIR="$(pwd -P)/.."
cd "$ORIG_DIR"

ANDROID_BUNDLE="$SCRIPT_DIR/android_bundle"
DEV_BUNDLE="$SCRIPT_DIR/dev_bundle"

# Put Android build tool-chain into path
export PATH="${ANDROID_BUNDLE}/android-sdk/tools:${ANDROID_BUNDLE}/android-sdk/platform-tools:${PATH}"

# Put ios-sim and ios-deploy binaries' paths into path
export PATH="${DEV_BUNDLE}/lib/ios-sim:${DEV_BUNDLE}/lib/ios-deploy:${PATH}"

# add ant
export ANT_HOME="${ANDROID_BUNDLE}/apache-ant-1.9.4"
export PATH="${ANT_HOME}/bin:${PATH}"

# add node
export PATH="${DEV_BUNDLE}/bin:${PATH}"
export NODE_PATH="${DEV_BUNDLE}/lib/node_modules"

export HOME="${ANDROID_BUNDLE}"

exec "${ANDROID_BUNDLE}/android-sdk/tools/android" "$@"

