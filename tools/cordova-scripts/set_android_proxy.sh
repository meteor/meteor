#!/bin/bash

# import all the environment
source $(dirname $0)/common_env.sh

adb shell sqlite3 /data/data/com.android.providers.telephony/databases/telephony.db \
    "update carriers set proxy='10.0.2.2', port='3002' where current=1"
adb shell stop
adb shell start
