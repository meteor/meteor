#!/bin/bash

# import all the environment
source $(dirname $0)/common_env.sh

if [ -z "$USE_GLOBAL_ADK" ] ; then
  exec "${ANDROID_BUNDLE}/android-sdk/tools/android" "$@"
else
  # android should be in global path
  exec android "$@"
fi

