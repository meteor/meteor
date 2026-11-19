# capacitor

Run Meteor apps in native Android and iOS projects with [CapacitorJS](https://capacitorjs.com). The package prepares Meteor's `web.cordova` output as a Capacitor `webDir`.

`meteor run android|ios` syncs the web assets and launches the app. `meteor build` runs the Capacitor CLI installed in the app and writes Android AAB/APK or iOS IPA files to the output directory.

Supports Capacitor 8 only. Native tooling requires Node.js 22+, JDK 21 and
Android SDK 36 for Android, and Xcode 26+ for iOS. New iOS projects use Swift
Package Manager. See the [setup and migration guide](../../v3-docs/docs/about/native-stack/capacitor-mobile.md).
