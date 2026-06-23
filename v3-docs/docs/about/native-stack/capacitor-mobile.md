---
outline:
  level: [2, 3]
---

# Capacitor (mobile)

Capacitor integration lets a Meteor app run inside native Android and iOS projects using [CapacitorJS](https://capacitorjs.com). Meteor still owns the web build. Capacitor owns the native shell.

In this setup, Meteor produces a native web bundle, transforms it into the Capacitor web directory, and syncs it into the Android or iOS project. This keeps compatibility with Meteor's mobile runtime while moving the native project lifecycle to Capacitor.

## Quick start

Add the Capacitor package:

``` bash
meteor add capacitor
```

Add a platform:

``` bash
# Android
meteor add-platform android

# iOS (macOS only)
meteor add-platform ios
```

Run the app:

``` bash
# Android
meteor run android

# iOS (macOS only)
meteor run ios
```

On first use, Meteor prepares the Capacitor project:

- Meteor installs Capacitor npm dependencies when automatic npm installation is enabled.
- Meteor scaffolds `capacitor.config.js` if your app does not already have one.
- Meteor creates a native web directory under `_build/native-dev`.
- Meteor runs `npx cap add <platform>` when the native project is missing.
- Meteor transforms the native web bundle and runs `npx cap sync <platform>`.

## Requirements

### Prepare Android and iOS tooling

Install the platform tooling before running native builds.

> See [**"Native Pre-Installation"**](./pre-installation.md) for Android SDK, Java, Gradle, Xcode, CocoaPods, emulator, and simulator setup.

### Add the Capacitor package

The integration is opt-in per app:

``` bash
meteor add capacitor
```

When the package is present, Meteor routes native Android and iOS commands through Capacitor.

### Configure the app id and name

Meteor scaffolds `capacitor.config.js` when it is missing:

``` js
const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.example.myapp',
  appName: 'MyApp',
  ios: { contentInset: 'always' },
}));
```

Change `appId` before distributing the app. The value must be a valid native application id, such as `com.company.product`.

The `defineConfig` helper receives a `Meteor` object with build, platform, and mode flags. It also applies Meteor defaults for `webDir`, `server`, and `SplashScreen`, while preserving user-defined Capacitor options.

## Project layout

The integration adds or uses these files and folders:

- `capacitor.config.js`: project-level Capacitor configuration.
- `_build/native-dev`: development web assets synced to Capacitor.
- `_build/native-prod`: production web assets synced to Capacitor.
- `android/`: Capacitor Android native project.
- `ios/`: Capacitor iOS native project.

The `_build` output and the synced native asset folders are generated and ignored by Git. The `android/` and `ios/` native projects are normal Capacitor projects and should be managed like application source.

## Development

### Bundled mode

Bundled mode is the default for `meteor run android` and `meteor run ios`.

``` bash
meteor run android
meteor run ios
```

In bundled mode, the native app starts from local web assets. Meteor's Hot Code Push remains enabled by default, so updated web assets can be downloaded from the Meteor server and loaded from app storage.

This matches the production shape more closely than direct server loading: the WebView loads local files first, then updates through Meteor's reload flow.

### Livereload mode

Use livereload mode when you want the native WebView to load directly from the running Meteor server:

``` bash
METEOR_CAPACITOR_MODE=livereload meteor run android
METEOR_CAPACITOR_MODE=livereload meteor run ios
```

In this mode, `@meteorjs/capacitor` sets Capacitor's `server.url` to the Meteor server URL. The app reloads from the server instead of starting from the local bundled web directory.

For Android emulators or physical devices, make sure the device can reach the Meteor server. Use `--mobile-server` when you need to provide a reachable host:

``` bash
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server 10.0.2.2:3000
```

For physical devices, use an address reachable from the same network, such as your development machine's LAN IP.

### Connection URL detection

Most apps do not need to set the LAN IP manually. In livereload mode, `@meteorjs/capacitor` uses the URL Meteor provides for the native run. Passing `--mobile-server` is the supported way to make that URL explicit when a device needs a specific reachable host.

When no explicit URL is available, the helper can fall back to a local network address and the current app port. Autodetection can choose the wrong interface when your machine has multiple network adapters, VPNs, Docker networks, or isolated emulator networking. In those cases, pass a reachable URL with `--mobile-server`:

``` bash
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server 192.168.1.4:3000
```

### Run on a device

Use the native device targets when you want to run on a connected physical device:

``` bash
# Android physical device
meteor run android-device

# iOS physical device (macOS only)
meteor run ios-device
```

You can pass Capacitor run options with `METEOR_CAPACITOR_*` environment variables. For example, `METEOR_CAPACITOR_TARGET` selects a Capacitor target device.

## Hot Code Push

Hot Code Push is enabled by default for Capacitor bundled mode.

``` json
{
  "meteor": {
    "capacitor": {
      "hcp": "webapp"
    }
  }
}
```

You can omit this setting because `"webapp"` is the default. `true` is also accepted and maps to `"webapp"`.

### How HCP works

``` text
Meteor server publishes a new web bundle
   |
   | autoupdate notices a new version
   v
WebAppLocalServer.checkForUpdates()
   |
   | bridge injected by the capacitor package
   v
@meteorjs/capacitor native runtime
   |
   | downloads assets and validates program.json
   v
pending version stored on device
   |
   | reload package calls switchToPendingVersion()
   v
WebView reloads from downloaded local assets
```

Meteor's existing `autoupdate` and `reload` packages drive the update decision. The Capacitor integration provides the `WebAppLocalServer` bridge that Meteor already calls in native mobile bundles, and `@meteorjs/capacitor` handles the Android and iOS file storage.

### Disable built-in HCP

Disable built-in HCP if you want a static bundled app or want an external updater to manage native web asset updates:

``` json
{
  "meteor": {
    "capacitor": {
      "hcp": false
    }
  }
}
```

You can also use `"none"`:

``` json
{
  "meteor": {
    "capacitor": {
      "hcp": "none"
    }
  }
}
```

When HCP is disabled, Meteor excludes `program.json` from the Capacitor web directory and injects a no-op `WebAppLocalServer` shim so existing Meteor native startup calls do not fail.

This is the expected setup when another Capacitor updater owns web asset delivery. For example, you can disable Meteor's built-in HCP and use [Capgo](https://capgo.app/) or another external live-update service to manage updates after the initial bundled app is installed.

## Production

Build the Meteor app with a production server URL:

``` bash
meteor build ../build-output --server=https://your-server-url.com --platforms=android
```

For iOS:

``` bash
meteor build ../build-output --server=https://your-server-url.com --platforms=ios
```

The Capacitor package transforms the production native web bundle into `_build/native-prod` and runs `cap sync` for the selected platform.

### Open native IDEs

After `meteor run` or `meteor build` has synced the native project, open the project with Capacitor tooling:

``` bash
npx cap open android
npx cap open ios
```

Android Studio handles Android signing and Play Store artifacts. Xcode handles iOS signing, archives, TestFlight, and App Store uploads.

## Compatibility notes

### Runtime detection

The `capacitor` package sets `Meteor.isCapacitor` on the client when the app is running inside a Capacitor native platform. This lets app code distinguish Capacitor from web browsers.

### Native plugins

Use Capacitor plugins for new native functionality. Native project customization should live in Capacitor configuration and the generated native projects.

### Current scope

The first Capacitor integration focuses on:

- Android and iOS projects.
- `meteor add-platform`, `meteor run`, and `meteor build`.
- Bundled mode by default.
- Optional livereload mode.
- Built-in Hot Code Push through `@meteorjs/capacitor`.
- Reusable Meteor tooling hooks instead of Capacitor-specific logic in unrelated packages.

Further migration topics will be added as the integration matures.
