---
outline:
  level: [2, 3]
---

# Capacitor (mobile)

Capacitor integration lets a Meteor app run inside native Android and iOS projects using [CapacitorJS](https://capacitorjs.com). Meteor still owns the web build. Capacitor owns the native shell.

:::warning
Meteor's Capacitor integration is experimental and under active development. Its commands, configuration, native project setup, Hot Code Push behavior, and supported package versions can change before stable release. Evaluate it carefully before using it in production.
:::

In this setup, Meteor produces a native web bundle, transforms it into the Capacitor web directory, and syncs it into the Android or iOS project. This keeps compatibility with Meteor's mobile runtime while moving the native project lifecycle to Capacitor.

## Quick start

Create Meteor app, then add Capacitor package:

``` bash
meteor create my-mobile-app
cd my-mobile-app
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

### Customize capacitor.config.js

The root `capacitor.config.js` file is dynamic, similar to `rspack.config.js`. Keep editing this source file in your app root; Meteor may write a generated `capacitor.config.json` snapshot under `_build/native-*`, but that generated file is not the configuration you maintain.

Meteor scaffolds a CommonJS `capacitor.config.js` file. If your app already has `capacitor.config.ts`, `capacitor.config.mjs`, `capacitor.config.cjs`, or `capacitor.config.json`, Meteor respects that file instead.

You can return any option supported by the [Capacitor configuration schema](https://capacitorjs.com/docs/v7/config) for the Capacitor version installed in your app, including `appId`, `appName`, `plugins`, `ios`, `android`, `server`, `loggingBehavior`, `appendUserAgent`, and other standard Capacitor options.

`@meteorjs/capacitor` deep-merges your config on top of Meteor defaults. This means nested blocks layer together, so adding a plugin config does not remove Meteor's default `plugins.SplashScreen` values. In livereload mode, Meteor preserves any `appendUserAgent` value you set and appends its own native marker. Meteor also sets `webDir` for the generated native web assets and controls `bundledWebRuntime`; do not set `bundledWebRuntime` yourself.

``` js
const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.example.myapp',
  appName: Meteor.isDevelopment ? 'MyApp Dev' : 'MyApp',
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: Meteor.isLivereload,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: Meteor.isDevelopment ? 0 : 500,
    },
  },
}));
```

The `Meteor` parameter gives the config file the current native build context:

| Flag | Type | Description |
|---|---|---|
| `isDevelopment` | boolean | True when the native web assets are being prepared for a development run. |
| `isProduction` | boolean | True when the native web assets are being prepared for a production build. |
| `isDebug` | boolean | True when Meteor debug mode is enabled. |
| `isVerbose` | boolean | True when verbose Meteor logging is enabled. |
| `isRun` | boolean | True when the command is running through `meteor run`. |
| `isBuild` | boolean | True when the command is running through `meteor build`. |
| `isCapacitor` / `isNative` | boolean | Always true inside the Capacitor config helper. |
| `isNativeAndroid` | boolean | True when the active native platform is Android. |
| `isNativeIos` | boolean | True when the active native platform is iOS. |
| `platform` | string | The active platform, usually `android` or `ios`. |
| `mode` | string | The Capacitor render mode, `bundled` or `livereload`. |
| `isBundled` | boolean | True when the native app starts from bundled local web assets. |
| `isLivereload` | boolean | True when the native app loads from the running Meteor server. |
| `rootUrl` | string | The server URL provided by Meteor, including values from `--mobile-server`. |
| `localIp` | string | A detected local network address used only when no explicit server URL is available. |
| `port` | string | The app port, usually `3000` in development. |
| `buildContext` | string | The build root used for generated native web assets, usually `_build`. |
| `webDir` | string | The generated web directory synced into Capacitor, such as `_build/native-dev` or `_build/native-prod`. |

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

Bundled mode still needs a reachable Meteor server for Hot Code Push. If the native app cannot reach that server, the app still launches from bundled assets, but it will not download updates.

On Android emulator, that usually means passing `--mobile-server 10.0.2.2:3000`:

``` bash
meteor run android --mobile-server 10.0.2.2:3000
```

`10.0.2.2` is Android emulator's special alias for the host machine. Meteor cannot infer that alias from your host network interfaces, so explicit `--mobile-server` is expected for this case.

### Livereload mode

Use livereload mode when you want the native WebView to load directly from the running Meteor server:

``` bash
METEOR_CAPACITOR_MODE=livereload meteor run android
METEOR_CAPACITOR_MODE=livereload meteor run ios
```

In this mode, `@meteorjs/capacitor` sets Capacitor's `server.url` to the Meteor server URL. The app reloads from the server instead of starting from the local bundled web directory.

Meteor also appends its own native marker to Capacitor's user agent in livereload mode. That lets Meteor keep serving the `web.cordova` client even after a hard refresh on normal client routes such as `/tasks`, without requiring app-specific router basenames.

For Android emulators or physical devices, make sure the device can reach the Meteor server. Use `--mobile-server` when you need to provide a reachable host:

``` bash
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server 10.0.2.2:3000
```

For physical devices, use an address reachable from the same network, such as your development machine's LAN IP.

Set `METEOR_CAPACITOR_MODE=livereload` when you want the native app to load directly from the running Meteor server.

### Connection URL detection

Most apps do not need to set the LAN IP manually. In native runs, `@meteorjs/capacitor` uses the URL Meteor provides for the native run. Passing `--mobile-server` is the supported way to make that URL explicit when a device needs a specific reachable host.

When no explicit URL is available, the helper can fall back to a local network address and the current app port. Autodetection can choose the wrong interface when your machine has multiple network adapters, VPNs, Docker networks, or isolated emulator networking. Android emulator is separate special case: its reachable host alias is `10.0.2.2`, not your machine's detected LAN IP. In those cases, pass a reachable URL with `--mobile-server`:

``` bash
meteor run android --mobile-server 10.0.2.2:3000
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server 10.0.2.2:3000
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

HCP modes:

| Mode | Meaning |
|---|---|
| `"webapp"` | Default. Meteor ships `program.json`, injects the native `WebAppLocalServer` bridge, and lets `autoupdate`/`reload` update bundled web assets. |
| `"none"` | Disables Meteor-managed HCP. Meteor omits `program.json` from the synced Capacitor web directory and installs a no-op compatibility shim. |

Use `"webapp"` when Meteor should own web asset updates. Use `"none"` when the app is intentionally static after install, or when another Capacitor live-update service owns web asset delivery.

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

Use Capacitor plugins for new native functionality. Install the plugin with npm, import it from your app code, then run the normal Meteor native command. Meteor runs `cap sync` as part of `meteor run`, `meteor build`, and `meteor add-platform` setup, so plugin native project changes are applied through the Meteor flow.

Example:

``` bash
meteor npm install @capacitor/device
meteor run android
```

``` js
import { Device } from '@capacitor/device';

const info = await Device.getInfo();
```

For plugins with native configuration, put the configuration in `capacitor.config.js` under `plugins`. Native project customization should live in Capacitor configuration and the generated `android/` and `ios/` projects.

### Current scope

The first Capacitor integration focuses on:

- Android and iOS projects.
- `meteor add-platform`, `meteor run`, and `meteor build`.
- Bundled mode by default.
- Optional livereload mode.
- Built-in Hot Code Push through `@meteorjs/capacitor`.
- Reusable Meteor tooling hooks instead of Capacitor-specific logic in unrelated packages.

Further migration topics will be added as the integration matures.
