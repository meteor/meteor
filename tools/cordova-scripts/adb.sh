#!/bin/bash

# import all the environment
source "$(dirname "$0")/common_env.sh"

cd "$ORIG_DIR"

if [ -z "$USE_GLOBAL_ADK" ] ; then
  exec "${ANDROID_BUNDLE}/android-sdk/platform-tools/adb" "$@"
else
  # adb should be in global path
  exec adb "$@"
fi

