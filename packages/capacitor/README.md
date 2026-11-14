# capacitor

Integrates [CapacitorJS](https://capacitorjs.com) into the Meteor build lifecycle. Reuses Meteor's existing `web.cordova` build output and transforms it into a Capacitor `webDir` (`build-native/`) so iOS/Android shells can be built with `npx cap sync` / `npx cap run`.

Supports Capacitor 8 only. Native tooling requires Node.js 22+, JDK 21 and
Android SDK 36 for Android, and Xcode 26+ for iOS. New iOS projects use Swift
Package Manager. See the [setup and migration guide](../../v3-docs/docs/about/native-stack/capacitor-mobile.md).
