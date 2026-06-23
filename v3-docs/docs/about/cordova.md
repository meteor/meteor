---
outline:
  level: [2, 3]
---

# Cordova (Legacy mobile)

Cordova is Meteor's legacy mobile integration. It remains documented for existing apps that already use [Apache Cordova](https://cordova.apache.org), while new native mobile work should use [Capacitor (mobile)](./native-stack/capacitor-mobile.md).

Cordova apps run in a web view, which is like a browser without the UI. Different browser engines have varying implementations and support for web standards. This means the web view your app uses can greatly affect its performance and available features. For details on supported features across browsers and versions, check caniuse.com.

This section summarizes the steps needed to set up your environment for existing Meteor Cordova development, manage development, and generate native artifacts for store uploads.

## Pre-Installation

Before you begin, make sure your development environment has the required Android and iOS platform tooling.

> See [**"Native Pre-Installation"**](./native-stack/pre-installation.md) for Android SDK, Java, Gradle, Xcode, CocoaPods, emulator, and simulator setup.

## Development

Once you have all the prerequisites set up, you can quickly get a mobile project running.

### Add platforms

To develop a mobile app, you need to add the platforms (iOS and Android) for Cordova:

```sh
# Android
meteor add-platform android

# iOS (only works on macOS)
meteor add-platform ios
```

### Run emulator

You can now run the application in development mode using the `meteor run` command:

```sh
# Android
meteor run android

# iOS (only works on macOS)
meteor run ios
```

#### Launch a new Android emulator

Use Android Studio to create or start Android emulators.

> See [**"Native Pre-Installation"**](./native-stack/pre-installation.md#android-emulators) for emulator setup.

#### Launch a new iOS emulator

Use Xcode to create or start iOS simulators.

> See [**"Native Pre-Installation"**](./native-stack/pre-installation.md#ios-simulators) for simulator setup.

### Run physical device

To run on a physical device, ensure the device is connected via USB or Wi-Fi:

```sh
# Android
meteor run android-device

# iOS (only works on macOS)
meteor run ios-device
```

You can manage connected devices in Android Studio and Xcode.

### Run HCP

Hot Code Push (HCP) lets the client automatically get the latest version when code changes are detected. This improves development with live reloads and ensures production apps receive updates without republishing to the stores.

For development, enable HCP by starting the application server with the `--mobile-server` option.

- On an emulator, run `meteor run android --mobile-server 10.0.2.2:3000`.

- On a real device, the device and server must be on the same network. Run `meteor run android --mobile-server XXX.XXX.XXX.XXX`, replacing the IP with your local development address, for example `192.168.1.4`.

For production, HCP is enabled automatically when you provide the `--server` option to the [`meteor build` command](../cli/index.md#meteor-build-meteorbuild). For more details on how HCP works with apps already published to production, see [Hot Code Push on mobile](/troubleshooting/hot-code-push).

### Open IDE

Once you have set up your Meteor project with Cordova, you may want to run or debug your mobile app using **Android Studio** or **XCode** directly. This can be useful for advanced debugging, custom configurations, or accessing specific platform tools

#### Open in Android Studio

1. Open **Android Studio**
2. Click on **"Open an existing Android Studio project"**
3. Navigate to your Meteor project directory:
   `.meteor/local/cordova-build/platforms/android/`
4. Open the project

Now you can manage your app with **Android Studio**, including connecting to physical devices or emulators, reviewing code, using debugging tools, and more.

#### Open in XCode

1. Open **XCode**
2. Navigate to the Meteor project directory:
   `.meteor/local/cordova-build/platforms/ios/`
3. Open the project or the `.xcworkspace` file

Now you can manage your app with **XCode**, including connecting to physical devices or emulators, reviewing code, using debugging tools, and more.

## Production

### Build

Once development is complete, you’ll need to build the actual mobile application (APK/AAB for Android or IPA for iOS) to distribute to users or upload to the app stores.

```sh
meteor build ../build-output --server=https://your-server-url.com
```

### Distribute

After building your Cordova project with Meteor, you can use **Android Studio** for Android and **Xcode** for iOS to handle signing and creating the final artifacts.

#### Android

1. Open **Android Studio**
2. Click on **"Open an existing Android Studio project"**
3. Navigate to your Meteor project directory:
   `./build-output/android/project`
4. Open the project
5. Go to **Build > Generate Signed Bundle / APK**
6. Follow the prompts to create or use a keystore, [configure signing](https://developer.android.com/studio/publish/app-signing#sign-apk), and build the APK/ABB.
7. Upload the APK/ABB to Play Store using Google Play Console


#### iOS

1. Open **XCode**
2. Navigate to the Meteor project directory:
   `../build-output/ios/project`
3. Open the project or the `.xcworkspace` file
4. [Configure Signing in Xcode](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates)
5. Go to **Product > Archive** to create an archive of your app
6. In the **Organizer** window, click **Distribute App** and follow the prompts to configure signing and export the IPA file.
7. Upload the IPA file to the App Store or distribute via TestFlight.

## Legacy device support

Meteor distinguishes between legacy and modern browsers - see the [modern browsers package](../packages/modern-browsers). Web apps include different code bundles for each, but Cordova apps only have a single code bundle. From Meteor 3.3.2 onwards, the default code bundle changed from legacy to modern.

You can force Meteor to use the legacy browser code bundle by setting the variable `modern.cordova` to `false` in `package.json` when running or building your app. For example:

```
  "meteor": {
    "mainModule": { ... },
    "testModule": { ... },
    "modern": { "cordova": false }
  }
```

Both the App Store and Google Play will only publish new and updated apps for a certain minimum mobile OS version. As of 2025, these minimum OS versions support the modern browser code bundle.
