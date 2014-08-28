#!/bin/bash

# import all the environment
source $(dirname $0)/common_env.sh

cd "$ORIG_DIR"

exec "${ANDROID_BUNDLE}/android-sdk/platform-tools/adb" "$@"

