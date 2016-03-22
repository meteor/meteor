---
title: Mobile
order: 13
description: How to build mobile apps using Meteor's Cordova integration.
---

After reading this guide, you'll know:

1. What Cordova is, and how Meteor integrates with it to build mobile apps from a single codebase
1. How to set up your local machine for mobile development
1. How to run and debug your app on a mobile device or simulator/emulator
1. How hot code push allows you to update your mobile app's code without reinstalling the app on your device or submitting a new version to the store
1. How to use Cordova plugins to take advantage of native device features
1. How to access local files and remote resources from your app
1. What you can do to create a good mobile user experience for your app
1. How to configure your app to use your own app icon, launch screen, and set other preferences
1. How to build your project and submit your mobile app to the store

<h2 id="introduction">Introduction to Meteor's built-in mobile integration</h2>

Meteor integrates with [Cordova](https://cordova.apache.org), a well-known Apache open source project, to build mobile apps from the same codebase you use to create regular web apps. With the Cordova integration in Meteor, you can take your existing app and run it on an iOS or Android device with a few simple commands.

A Cordova app is a web app written using HTML, CSS, and JavaScript as usual, but it runs in a web view embedded in a native app instead of in a stand-alone mobile browser. An important benefit of packaging up your web app as a Cordova app is that all your assets are bundled with the app. This ensures your app will load faster than a web app running on a remote server could, which can make a huge difference for users on slow mobile connections. Another feature of the Cordova integration in Meteor is support for [hot code push](#hot-code-push), which allows you to update your app on users' devices without going through the usual app store review process.

The Cordova platform also opens up access to certain device-native features through a [plugin architecture](#cordova-plugins). These plugins offer a JavaScript interface to native code interacting with platform APIs. This allows you to use the device camera, access the file system, interact with barcode or NFC readers, etc.

Because a Cordova app is  a web app, this means you use standard web elements to create your user interface instead of relying on platform-specific native UI components. Creating a good [mobile user experience](#mobile-ux) is an art in itself, but is fortunately helped by the availability of various frameworks and libraries.

> <h4 id="what-about-phonegap">What about PhoneGap?</h4>

> You may have heard of PhoneGap, and wonder how it relates to Cordova. PhoneGap is a product name used by Adobe since 2011, when they acquired a company called Nitobi, the original creators of what is now the Cordova project. When Adobe donated the code to Apache in 2012 to ensure a more open governance model, the open source project was rebranded as Cordova. PhoneGap is now one of the distributions of Cordova, on a par with other distributions like Ionic, Telerik, Monaca, or Intel XDK. These distributions mainly differ in tooling and integration with cloud services, but they share the underlying platform and plugins. Meteor could also be considered a Cordova distribution.

<h3 id="cordova-integration-in-meteor">How does the Cordova integration in Meteor work?</h3>

With Meteor, there is no need to install Cordova yourself, or use the `cordova` command directly. Cordova project creation happens as part of the Meteor run and build commands, and the project itself is considered a build artifact (stored in `.meteor/local/cordova-build` in your app directory) that can be deleted and recreated at any time. Instead of having you modify Cordova's `config.xml` file, Meteor reads a [`mobile-config.js`](http://docs.meteor.com/#/full/mobileconfigjs) file in the root of your app directory and uses the settings specified there to configure the generated project.

Cordova apps don’t load web content over the network, but rely on locally stored HTML, CSS, JavaScript code and other assets. While Cordova by default uses `file://` URLs to serve the app, Meteor includes an integrated file serving mechanism on the device to support both bundling the initial assets and incrementally updating your app through [hot code push](#hot-code-push). This means your app will be served from `http://localhost:<port>`, which also has the benefit that web view's consider it a [secure origin](https://www.chromium.org/Home/chromium-security/prefer-secure-origins-for-powerful-new-features) and won't block any sensitive features (which they increasingly do for `file://` URLs).

> <h4 id="what-port">What port will your app be served from?</h4>

> While Meteor uses a built-in request interception mechanism on Android, supporting `WKWebView` on iOS requires running a real embedded web server instead. That means the local web server needs a port to bind to, and we can’t simply use a fixed port because that might lead to conflicts when running multiple Meteor Cordova apps on the same device. The easiest solution may seem to use a randomized port, but this has a serious drawback: if the port changes each time you run the app, web features that depend on the origin (like caching, localStorage, IndexedDB) won’t persist between runs, and you also wouldn't be able to specify a stable OAuth redirect URL. So instead we now pick a port from a predetermined range (12000-13000), calculated based on the `appId`, a unique identifier that is part of every Meteor project. That ensures the same app will always use the same port, but it hopefully avoids collisions betweens apps as much as possible. (There is still a theoretical possibility of the selected port being in use. Currently, starting the local server will fail in that case.)

<h3 id="what-environment">What environment does your Cordova app run in?</h3>

<h4 id="wkwebview">WKWebView</h4>

On iOS, Meteor uses WKWebView by default, on both iOS 8 and iOS 9.
[...]

<h4 id="crosswalk">Crosswalk</h4>

The [Crosswalk plugin](https://crosswalk-project.org/documentation/cordova/cordova_4.html) offers a hugely improved web view on older Android versions. It replaces the standard Android WebView with a version based on Chromium, the open source project behind Google Chrome. You can add the plugin to your app with `meteor add crosswalk`.
[...]

<h3 id="adding-platforms">Adding Cordova platforms to your app</h3>

Every Meteor project targets a set of platforms. Platforms can be added to a Meteor project with `meteor add-platform`.

- `meteor add-platform ios` adds the iOS platform to a project.
- `meteor add-platform android` adds the Android platform to a project.
- `meteor remove-platform ios android` will remove the iOS and Android platforms from a project.
- `meteor list-platforms` lists the platforms targeted by your project.

If your local machine does not (yet) fulfill the [prerequisites](#installing-prerequisites) for building apps for a mobile platform, an error message with a list of missing requirements is printed (but the platform is still added). You will have to make sure these requirements are fulfilled before you're able to build and run mobile apps from your machine.

<h2 id="installing-prerequisites">Installing prerequisites</h2>

In order to build and run mobile apps, you will need to install some prerequisites on your local machine.

<h3 id="installing-prerequisites-ios-on-mac">iOS on Mac</h3>

In order to build and run iOS apps, you will need a Mac with Xcode 7.2 installed.

<h4>Installing Xcode from the App Store</h4>

`meteor add-platform ios` will open a dialog asking you whether you want to install the 'command line developer tools'. Do not select 'Install' here, because a full Xcode installation is required to build and run iOS apps. Instead, selecting 'Get Xcode' will open the Mac App Store page for Xcode and you can click install there. (Alternatively, you can open the Mac App Store and search for 'Xcode' to get to that same page.)

<h4>Accepting the license agreement</h4>

After the download and installation completes, you will need to accept the license agreement. If you start Xcode for the first time, a dialog will pop up where you can read the license agreement and accept it. You can close Xcode directly afterwards.

A shortcut is to run `sudo xcodebuild -license accept` from the command line. (You will still be expected to have read and understood the [Xcode and Apple SDKs Agreement](https://www.apple.com/legal/sla/docs/xcode.pdf)).

<h3 id="installing-prerequisites-android-on-mac">Android on Mac</h3>

In order to build and run Android apps on a Mac, you will need to:

- Install a Java Development Kit (JDK)
- Install the Android SDK and download the required tools, platforms, and other components (which is done most easily by installing Android Studio)
- Optionally: Set `ANDROID_HOME` and add the tools directories to your `PATH`
- Optionally: Create an Android Virtual Device to run apps on an emulator

<h4>Installing the Java Development Kit (JDK)</h4>

1. Open the [Oracle Java website](http://www.oracle.com/technetwork/java/javase/downloads/index.html), and select the Java Platform (JDK)
1. Check the box to accept the license agreement, and select the Mac OS X disk image file (`jdk-8u**-macosx-x64.dmg`)
1. Open the downloaded disk image, launch the installer, and complete the installation steps.

<h4>Installing the Android SDK and download the required tools, platforms, and other components</h4>

The easiest way to get a working Android development environment is by installing [Android Studio](http://developer.android.com/sdk/index.html), which offers a setup wizard on first launch that installs the Android SDK for you, and downloads a default set of tools, platforms, and other components that you will need to start developing.

There is no need to use Android Studio if you prefer a stand-alone install however. Just make sure you install the most recent versions of the [Android SDK Tools](http://developer.android.com/sdk/index.html#Other) and download the required [additional packages](http://developer.android.com/sdk/installing/adding-packages.html) yourself using the Android SDK Manager. Make sure to select SDK Platform API 23, because that is what the version of Cordova we bundle requires.

<h4>Optionally: Setting `ANDROID_HOME` and adding the tools directories to your `PATH`</h4>

Cordova will detect an Android SDK installed in various standard locations automatically, but in order to use tools like `android` or `adb` from the terminal, you will have to make some changes to your environment.

- Set the `ANDROID_HOME` environment variable to the location of the Android SDK. If you've used the Android Studio setup wizard, it should be installed in `~/Library/Android/sdk` by default.
- Add `$ANDROID_HOME/tools`, and `$ANDROID_HOME/platform-tools` to your `PATH`

You can do this by adding these lines to your `~/.bash_profile` file (or the equivalent file for your shell environment, like `~/.zshrc`):
```
# Android
export ANDROID_HOME="/Users/<username>/Library/Android/sdk"
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

You will then have to reload `.bash_profile` (by executing `source ~./bash_profile`) or open a new terminal session to apply the new environment.

<h4>Optionally: Creating an Android Virtual Device (AVD) to run apps on an emulator</h4>

The current Android emulator tends to be rather slow and can be unstable, so our recommendation is to run your app on a physical device instead.

If you do want to run on an emulator however, you will have to create an Android Virtual Device (AVD) using the [AVD Manager](http://developer.android.com/tools/devices/managing-avds.html). Make sure to configure one with API level 23, because that is what the version of Cordova we bundle requires.

<h3 id="installing-prerequisites-android-on-linux">Android on Linux</h3>

[...]

<h3 id="installing-prerequisites-android-on-windows">Android on Windows</h3>

[...]

<h2 id ="running-your-app">Running your app on a mobile device for development</h2>

During development, the Meteor [build tool](build-tool.html) integrates with Cordova to run your app on a physical device or the iOS Simulator/Android emulator. In addition to starting a development server and MongoDB instance as usual, `meteor run` accepts arguments to run the app on one or more mobile targets:

- `ios`: Runs the app on the iOS Simulator
> Currently, this will always run your app on a simulated iPhone 6s Plus. Use `ios-device` to open Xcode and select another simulator instead.
- `ios-device`: Opens Xcode, where you can run the app on a connected iOS device or simulator
- `android`: Runs the app on the Android emulator
> The current Android emulator tends to be rather slow and can be unstable. Our recommendation is to run on a physical device or to use an alternative emulator like [Genymotion](https://www.genymotion.com).
- `android-device`: Runs the app on a connected Android device

You can specify multiple targets, so `meteor run ios android-device` will run the app on both the iOS Simulator and an Android device for example.

<h4 id="connecting-to-the-server">Connecting to the server</h4>

A Meteor app should be able to connect to a server in order to load data and to enable [hot code push](#hot-code-push), which automatically updates a running app when you make changes to its files. During development, this means the device and the computer you run `meteor` on will have to be part of the same WiFi network, and the network configuration shouldn't prevent the device from reaching the server. You may have to change your firewall or router settings to allow for this (no client isolation).

`meteor run` will try to detect the local IP address of the computer running the command automatically. If this fails, or if you would like your mobile app to connect to a different server, you can specify an address using the `--mobile-server` option.

<h3 id="running-on-ios">How to run your app on an iOS device</h3>

> Note: If you haven't previously developed iOS apps, or haven't used the connected device for development, a series of dialogs and warnings may appear as Xcode resolves code signing issues. It may also prompt you for permission to access the key in your keychain. See [Apple's instructions](https://developer.apple.com/library/mac/documentation/IDEs/Conceptual/AppDistributionGuide/LaunchingYourApponDevices/LaunchingYourApponDevices.html#//apple_ref/doc/uid/TP40012582-CH27-SW4) for more information.

1. Make sure the device is connected to your computer via a USB cable.
1. Connect the device to a WiFi network that allows for communication with the server.
1. Run `meteor run ios-device` to open your project in Xcode.
1. In the project navigator, choose your device from the Scheme toolbar menu:
<img src="images/mobile/xcode-select-device.png" style="width: 30%; height: 30%">
1. Click the Run button:
<img src="images/mobile/xcode-run-scheme.png" style="width: 50%; height: 50%">
1. Xcode builds the app, installs it on the device, and launches it.

<h3 id="running-on-android">How to run your app on an Android device</h3>

1. Make sure the device is connected to your computer via a USB cable.
1. Connect the device to a WiFi network that allows for communication with the server.
1. Make sure your device is set up for development [as explained here](http://developer.android.com/tools/device.html#setting-up).
1. You may also need to click 'Allow' on the `Allow USB debugging?` prompt on the device.
1. Run `meteor run android-device` to build the app, install it on the device, and launch it.

> To check if your device has been connected and set up correctly, you can run `adb devices` to get a list of devices.

<h2 id="logging-and-remote-debugging">Using logging and remote debugging tools</h2>

A full-stack mobile app consists of many moving parts, and this can make it difficult to diagnose issues. Logging is indispensable in keeping track of what's going on in your app, and may show warnings and errors that you would otherwise miss. Even more powerful is remote debugging, which is the ability to interact with a mobile app running on a remote device from a debugging interface in Safari (for iOS) or Chrome (for Android).

<h3 id="understanding=logs">Understanding the different types of logs</h3>

You will encounter three types of logs in a Meteor Cordova app:

- **Server-side logs** - Messages printed by the Meteor build system, and the result of `console` logging calls from server-side code.
- **Client-side web logs** - Warnings and errors from the web view, and the result of `console` logging calls from client-side code.
- **Client-side native logs** - Messages from system components and Cordova plugins. This also includes more detailed logging from the Meteor plugin used for [hot code push](#hot-code-push).

When using `meteor run`, server-side logs will be printed in the terminal as usual. In addition, running on an Android device or emulator will print a subset of the logs to that same terminal (these logs also include `console` logging calls made from client-side code).

Running on iOS will not show client-side logs in the terminal, but Xcode will show native logs as usual in the [debug console](https://developer.apple.com/library/tvos/documentation/DeveloperTools/Conceptual/debugging_with_xcode/chapters/debugging_tools.html). You can add [cordova-plugin-console](https://github.com/apache/cordova-plugin-console) to your project to output  `console` logging calls to the native logs (which Android does by default), but this isn't recommended because it has a substantial performance impact, and remote debugging gives you much nicer and more complete console output.

Although having client-side logs in the terminal can be useful, in most cases remote debugging is a much better option. This allows you to use the debugging tools built into Safari (for iOS apps) or Chrome (for Android apps) to investigate an app running on a remote device or a simulator/emulator. Here, you can not only view the logs, but also interact with running JavaScript code and the DOM, monitor network access, etc.

<h3 id="remote-debugging-ios">How to remote debug your iOS app with Safari</h3>

1. To use remote debugging in Safari, you'll first need to enable the Developer menu. Go to *Safari > Preferences* and make sure 'Show Develop menu in menu bar' is checked:
<img src="images/mobile/mac-safari-preferences-show-develop-menu.png">

1. You'll also need to enable the Web Inspector on your iOS device. Go to *Settings > Safari > Advanced* and enable 'Web Inspector':
<img src="images/mobile/ios-safari-settings-web-inspector.png" style="width: 75%; height: 75%">

1. Launch the app on your device and open remote debugger by choosing *Develop > &lt;Your device&gt; > &lt;Your app&gt;/localhost*.

1. Because you can only connect to your app after it has started up, you sometimes miss startup warnings and errors. You can invoke `location.reload()` in the Web Inspector console to reload a running app, this time with the remote debugger connected.

You can find more information about remote debugging in the [Safari Developer Guide](https://developer.apple.com/library/safari/documentation/AppleApplications/Conceptual/Safari_Developer_Guide/).

<h3 id="remote-debugging-android">How to remote debug your Android app with Chrome</h3>

See [this article](https://developers.google.com/web/tools/chrome-devtools/debug/remote-debugging/remote-debugging#remote-debugging-on-android-with-chrome-devtools) for instructions on how to remote debug your Android app with the Chrome DevTools.

- Because you can only connect to your app after it has started up, you sometimes miss startup warnings and errors. You can invoke `location.reload()` in the DevTools console to reload a running app, this time with the remote debugger connected.

<h2 id="hot-code-push">Hot code push on mobile</h2>

During development, the Meteor [build tool](build-tool.html) detects any relevant file changes, recompiles the necessary files, and notifies all connected clients a new version is available. Clients can then automatically reload the app, switching over to the new version of the code. This is referred to as *hot code push*.

Meteor supports hot code push on both browser and mobile clients, but the process on mobile is a bit different. In a browser, reloading the app will re-request assets from the server, and the server will respond with the most recent versions. Because Cordova apps rely on locally stored assets however, hot code push on mobile is a two step process:
1. Updated assets are downloaded from the server using native downloading mechanisms, and stored on the device
1. The page is reloaded and the web view re-requests the assets from the local web server

An important benefit of this is that while downloading may be slow over mobile connections, this is done in the background, and we won't attempt to reload the app until all assets have been downloaded to the device.

Downloading updates is done incrementally, so we only download assets that have actually changed (based on a content hash). In addition, if we haven't been able to download all changed assets in one go, because of a network failure or because the app was closed before we finished, we will reuse the ones that have already completed downloading the next time the app starts up or the network connection is restored.

<h3 id="updating-production-apps">Updating apps in production</h3>

Hot code push greatly improves the development experience, but on mobile, it is also a really useful feature for production apps, because it allows you to quickly push updates to devices without having users update the app through the store and without going through a possibly lengthy review process to get your update accepted.

However, it is important to realize that hot code push can only be used to update the HTML, CSS, JavaScript code and other assets making up your web app. Changes to native code will still require you [to submit a new version of your app to the store](#building-and-submitting).

In order to avoid a situation where JavaScript code that relies on changed native code is pushed to a client, we calculate a compatibility version from the Cordova platform and plugin versions, and only download a new version to a device when there is an exact match. This means any change to the list of plugins, or updating to a Meteor release which contains a new platform version, will block hot code push to existing mobile clients until the app has been updated from the store.

<h3 id="configuring-server-for-hot-code-push">Configuring your server for hot code push</h3>

As mentioned before, mobile apps need to be able to [connect to a server](#connecting-to-the-server) to support hot code push. In production, you will need to specify which server to connect to [when building the app](#building-for-production) using the `--server` option. The specified server address is used to set `ROOT_URL` in `__meteor_runtime_config__`, which is defined as part of the generated `index.html` in the app bundle.

In addition, you will need to configure the server with the right connection address. This happens automatically if you're using `meteor deploy` to deploy to Galaxy, but when deploying to your own server you'll have to make sure to define the `ROOT_URL` environment variable there. (For Meteor Up, you can configure this in `mup.json`.)

The reason this is needed is because updates delivered through hot code push replace the initially bundled `index.html` with a freshly generated one. If the `ROOT_URL` on your server hasn't been set, it defaults to `localhost:3000`, and this would leave the app unable to connect to the server, both for data loading and for receiving further hot code pushes. In Meteor 1.3, we protect against this by blocking updates that would change the `ROOT_URL` to `localhost`, but the consequence of this is that hot code push is disabled until you configure `ROOT_URL` correctly.

<h3 id="recovering-from-faulty-versions">Recovering from faulty versions</h3>

Hot code pushing updated JavaScript code to a device could accidentally push code containing errors, which might leave users with a broken app (a 'white screen of death', in the worst case), and could even disable hot code push (because the code that makes a connection to the server may no longer run).

To avoid this, we try to detect faulty versions and revert to the last known good version when this happens. The way detection works is that we expect all `Meteor.startup()` callbacks to complete within a set period of time. If this doesn't happen we consider the version faulty and will rollback the update. Unless the version on the server has been updated in the meantime, the server will try to hot code push the faulty version again. Therefore, we blacklist faulty versions on the device so we know not to retry.

By default, the startup timeout is set to 20 seconds. If your app needs more time to startup (or considerably less), you can use [`App.setPreference`](http://docs.meteor.com/#/full/App-setPreference) to set `WebAppStartupTimeout` to another value.

<h2 id="cordova-plugins">Using native device features with Cordova plugins</h2>

[This has been copied from the existing Wiki and still needs to be rewritten.]

Any functionality which relies on a Cordova plugin should wrap code in a `Meteor.startup()` block to make sure the plugin has been fully initialized. For example, when using the Cordova geolocation plugin:

```js
Meteor.startup(function() {
    // Here we can be sure the plugin has been initialized
    navigator.geolocation.getCurrentPosition(success);
});

// The plugin may not have been initialized here
navigator.geolocation.getCurrentPosition(success);
```

<h3>Adding Cordova plugin dependencies to Meteor packages</h3>

A Meteor package can register a dependency on a Cordova plugin with the `Cordova.depends()` syntax. For example, a Meteor package that depends on the Cordova 'camera' plugin would add the following to its `package.js`:

```js
Cordova.depends({
    'cordova-plugin-camera': '1.2.0'
});
```

Any project that includes this package will now have the `navigator.camera` object in its global scope. Note that this will pollute the global scope, so be careful to include all the necessary plugins when developing a package.

If the desired plugin version is not published on [npm](https://www.npmjs.com/search?q=ecosystem%3Acordova) yet, you can specify a Git URL for obtaining the plugin:

```js
Cordova.depends({
    'com.phonegap.plugins.facebookconnect': 'https://github.com/Wizcorp/phonegap-facebook-plugin.git#5dbb1583168558b4447a13235283803151cb04ec'
});
```

A GitHub URL would look like this: `https://github.com/organization/repo.git#SHA`. Meteor uses URLs with SHAs, so it is easy to ensure repeatable builds (SHAs always point at the same commit, tags and branches can point to different commits over time).

<h3>Adding Cordova plugins directly to your application</h3>

You can use Cordova plugins directly in your application without wrapping the plugin into a Meteor package.
Similar to Meteor packages, you can add them to your application with `meteor add` command prepending the plugin names with the `cordova` namespace:

```sh
# Add plugin from npm
meteor add cordova:cordova-plugin-camera@1.2.0

# Add plugin from a Git URL
# (make sure you use the correct plugin ID from plugin.xml)
meteor add cordova:com.phonegap.plugins.facebookconnect@https://github.com/Wizcorp/phonegap-facebook-plugin.git#5dbb1583168558b4447a13235283803151cb04ec

# The list of added plugins will also show up in meteor list
meteor list

# Remove plugins
meteor remove cordova:org.apache.cordova.cam
meteor remove cordova:com.phonegap.plugins.facebookconnect
```

Note: right now we don't resolve any versions conflicts between plugins directly added to your app and plugins used by Meteor packages. One will most likely override another but in not a particularly intelligent way.

<h3>Cordova plugins configuration</h3>

Some Cordova plugins, such as the 'Facebook Connect' plugin, require build-time variables such as an `APP_ID` or `APP_NAME`. To include these variables in your Cordova build, set them up in your [mobile-config.js](http://docs.meteor.com/#mobileconfigjs).

<h3>Adding Cordova-specific Javascript code to your application</h3>

The same way you can use `Meteor.isServer` and `Meteor.isClient` booleans to separate your client-side code and server-side code, you can use `Meteor.isCordova` to separate your Cordova-specific code from the rest of your code.

```js
if (Meteor.isServer) {
  console.log("Printed on the server");
}

if (Meteor.isClient) {
  console.log("Printed in browsers and mobile apps");
}

if (Meteor.isCordova) {
  console.log("Printed only in mobile Cordova apps");
}
```

In addition, packages can include a different set of files for Cordova builds and browser builds with `addFiles`:

- `api.addFiles('foo.js', 'web.cordova')`: includes `foo.js` in only Cordova builds.
- `api.addFiles('bar.js', 'web.browser')`: includes `bar.js` in only browser builds.
- `api.addFiles('baz.js', 'web')`: includes `baz.js` in all client builds.

The same syntax can be used for `api.use`, `api.imply`, and `api.export`.

<h3>Using Meteor packages with mobile functionality</h3>

Ideally a good Meteor package would work well on both mobile platforms and on the web. Some isomorphic packages providing functionality like geolocation and camera support are built by MDG and are available on Atmosphere and GitHub: https://github.com/meteor/mobile-packages

<h2 id="accessing-local-files-and-remote-resources">Accessing local files and remote resources</h2>

<h3 id="accessing-local-files">Accessing local files</h3>

[...]

The plugin allows for local file access on both iOS and Android. You can construct file system URLs manually (`http://localhost:<port>/local-filesystem/<path>`) or use `WebAppLocalServer.localFileSystemUrl()` to convert `file://` URLs received from plugins like `cordova-plugin-file` and `cordova-plugin-camera`.

<h3 id="cors">Understanding cross-origin resource sharing (CORS)</h3>

[...]

<h2 id="mobile-ux">Creating a good mobile user experience</h2>

[...]

<h2 id="configuring-your-app">Configuring your app</h2>

[...]

<h2 id="building-and-submitting">Submitting your mobile app to the store</h2>

<h3 id="building-for-production">Building your mobile app for production</h3>

Use `meteor build <build-output-directory> --server <host>:<port>` to build your app for production.

The `<host>` and `<port>` should be the address of the server you want your app to connect to.

This will generate a directory at `<build-output-directory>`, which includes a server bundle tarball and the project source for each targeted mobile platform in the `/ios` and `/android` directories.

You can pass `--server-only` to only build the server bundle. This allows you to build your app without installing the mobile SDKs on the build machine. This is useful if you use an automated deployment setup for instance. (If you remove the mobile platforms before building instead, hot code push will be disabled because the assets for Cordova included in the server bundle will not be generated.)

<h3 id="submitting-ios">How to submit your iOS app to the App Store</h3>

In order to build your app for iOS, you will need to [configure your app](#configuring-your-app) with at least a version number, and the required set of app icons and launch screens.

After running `meteor build` you can open the generated Xcode project in Xcode:
```sh
cd <build-output-directory>/ios/project
open MyApp.xcodeproj
```

From this point on, the process for building the app archive and submitting it to the App Store is the same as it would be for any other iOS app. Please refer to [Apple's documentation](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/SubmittingYourApp/SubmittingYourApp.html) for further details.

<h3 id="submitting-android">How to submit your Android app to the Play Store</h3>

In order to build your app for Android, you will need to [configure your app](#configuring-your-app) with at least a version number, and the required set of app icons and launch screens.

After running `meteor build` the generated APK will be copied from the `<build-output-directory>/android/project/build/outputs/apk` directory to `<build-output-directory>/android/release-unsigned.apk`.

Before submitting the APK(s) to the Play Store, you will need to sign the APK and run [`zipalign`](http://developer.android.com/tools/help/zipalign.html) on it to optimize the archive.

(See the [Android developer documentation](http://developer.android.com/tools/publishing/app-signing.html) for more details about the app signing procedure.)

To sign your app, you'll need a private key. This key lets you publish and update your app. If you haven't made a key for this app yet, run:
```sh
keytool -genkey -alias your-app-name -keyalg RSA -keysize 2048 -validity 10000
```
Optionally, you can specify `--keystore` to use a different keystore. Don't forget to specify the same keystore when signing the APK.
> Note: Ensure that you have secure backups of your keystore (`~/.keystore` is the default). If you publish an app to the Play Store and then lose the key with which you signed your app, you will not be able to publish any updates to your app, since you must always sign all versions of your app with the same key.


Now, you can sign the APK:
```sh
cd ~/build-output-directory/android/
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 release-unsigned.apk your-app-name
```
Next, you can run zipalign on it to optimize the APK:
```sh
$ANDROID_HOME/build-tools/<build-tools-version>/zipalign 4 release-unsigned.apk <your-app-name>.apk
```

From this point on, the process for submitting the app to the Play Store is the same as it would be for any other Android app. `<your-app-name>.apk` is the APK to upload to the store. Learn more by visiting https://play.google.com/apps/publish.

<h4>Submitting an app using Crosswalk to to Play Store</h4>

Because Crosswalk bundles native code for Chromium, you will end up with APKs for both ARM and x86. You can find the generated APKs in the `<build-output-directory>/android/project/build/outputs/apk` directory.

You will have to sign and `zipalign` both APKs. You will also have to submit both to the Play Store, see  [submitting multiple APKs](http://developer.android.com/google/play/publishing/multiple-apks.html) for more information.
