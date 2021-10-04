# CHANGELOG

## v2.0.0, 2020-10-04
Use WebViewAssetLoader on Android with newest cordova AndroidX webview usage

## v1.9.1, 2020-03-05
Removes hook to set Swift version

## v1.9.0, 2020-03-04
Migrates Swift code to be compatible with Swift version 5

## v1.8.0, 2020-01-16
It makes cordova-plugin-meteor-webapp ready for Cordova 9.
- changes context.requireCordovaModule to require for non-Cordova modules
- removes .woff content type test because it never worked
- updates travis test to use recent versions
- removes .paramedic.config.js and use options directly on package.json
- declares xcode as npm dependency
- updates dev dependencies
- updates DEVELOPMENT.md

This version should be used for apps running Meteor 1.10 forward.

## v1.7.4, 2020-01-16
We didn't had a tag for 1.7.0 that was the last version before the updates for 
Cordova 9 then we published 1.7.4 from this revision d5a7377c.

This version should be used for apps running Meteor 1.9 or previous versions.
