#!/bin/bash

# import all the environment
source "$(dirname "$0")/common_env.sh"

cd "$ORIG_DIR"

exec "${DEV_BUNDLE}/lib/node_modules/cordova/bin/cordova" "$@"

