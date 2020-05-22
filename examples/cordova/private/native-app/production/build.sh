#!/usr/bin/env bash

# replace cordova-example build details
env=production
appId=com.meteorapp.mobile
appName=Mobile
buildFolder=meteor-mobile-build-production
host=https://mobile.meteorapp.com
androidVersion=29.0.2
pathToAndroidKeyStore=/Users/filipe/Documents/meteor/ws/mobile/keystore
androidPassword=asdWEQdsaD

# build
cd ../../../
rm -rf .meteor/local/cordova-build
rm -rf ../../$buildFolder
echo building app pointing to $host
METEOR_DISABLE_OPTIMISTIC_CACHING=1 LANG=en_US.UTF-8 MOBILE_APP_ID=$appId meteor build ../../$buildFolder --server=$host --mobile-settings private/env/$env/settings.json

cd ../../$buildFolder

# open xcode
open ios/project/$appName.xcworkspace

# sign android
cd android/project/app/build/outputs/apk/release
rm -rf $appName.apk
echo 'Executing: zipalign'
$ANDROID_HOME/build-tools/27.0.3/zipalign -f 4 app-release-unsigned.apk $appName.apk
echo 'Executing: apksigner'
$ANDROID_HOME/build-tools/27.0.3/apksigner sign --ks $pathToAndroidKeyStore --ks-pass pass:$androidPassword --v1-signing-enabled true --v2-signing-enabled true $appName.apk
