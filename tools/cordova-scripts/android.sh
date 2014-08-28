#!/bin/bash

# import all the environment
source $(dirname $0)/common_env.sh

exec "${ANDROID_BUNDLE}/android-sdk/tools/android" "$@"

