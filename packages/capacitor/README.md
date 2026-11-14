# capacitor

Integrates [CapacitorJS](https://capacitorjs.com) into the Meteor build lifecycle. Reuses Meteor's existing `web.cordova` output as a Capacitor `webDir`. Native run transforms and syncs the assets before launch. Native `meteor build` also invokes the app-local Capacitor builder and collects Android AAB/APK or iOS IPA output in the requested destination.

Supports Capacitor 8 only. Native tooling requires Node.js 22+, JDK 21 and
Android SDK 36 for Android, and Xcode 26+ for iOS. New iOS projects use Swift
Package Manager. See the [setup and migration guide](../../v3-docs/docs/about/native-stack/capacitor-mobile.md).
