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

For an existing Cordova application, follow [Migrate from Cordova](#migrate-from-cordova) before creating native projects.

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

This integration supports Capacitor 8 only, with a minimum version of 8.6.2.
New apps install that baseline automatically on their first native command.
Use Node.js 22+, JDK 21, Android Studio 2025.2.1+ with Android SDK 36, and
Xcode 26+ for iOS. Native deployment targets are Android API 24+ and iOS 15+.
New iOS projects use Swift Package Manager; existing CocoaPods projects remain
supported. See the [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

> See [**"Native Pre-Installation"**](./pre-installation.md) for Android SDK, Java, Gradle, Xcode, CocoaPods, emulator, and simulator setup.

### Add the Capacitor package

The integration is opt-in per app:

``` bash
meteor add capacitor
```

When the package is present, Meteor routes native Android and iOS commands through Capacitor.

Capacitor uses the shared npm dependency manager, including npm, Yarn, and pnpm
workspaces. Set `meteor.autoInstallDeps` to `false` in `package.json` to manage
dependencies yourself; missing or outdated dependencies produce install commands
before native preparation starts. `meteor update --npm` explicitly installs or
updates the required packages even with automatic installation disabled. It
does not create native projects or run `cap sync`.

As with Rspack, the shared manager uses a minimum-version check: missing
packages and older Capacitor 8 core, CLI, or selected platform packages are
installed or upgraded to 8.6.2. Newer compatible 8.x installations are kept.
Future increases to the integration's minimum use the same mechanism. Upgrading
an existing Capacitor 7 native project still requires the explicit migration below.

Capacitor packages may be declared in either `dependencies` or
`devDependencies`. Keep `@capacitor/core`, `@capacitor/cli`, and each selected
platform package within major 8, with matching compatible versions. Meteor
checks installed plugin core peers rather than requiring every plugin to share
Capacitor's major number. Unsupported declarations and installed versions stop
native preparation before dependency installation or project generation.

### Run from a Meteor checkout

Clone the integration branch with its submodules and initialize the checkout:

``` bash
git clone --recursive --branch capacitor-integration https://github.com/meteor/meteor.git meteor
cd meteor
./meteor --help
export METEOR_CHECKOUT="$PWD"
export METEOR_BIN="$METEOR_CHECKOUT/meteor"
```

For an existing checkout, run `git submodule update --init --recursive` first.
Inside your app, add Capacitor and install both local npm packages as archives
so Rspack resolves its dependencies from the app:

``` bash
cd /absolute/path/to/my-app
"$METEOR_BIN" add capacitor
export METEOR_NPM_DIR="$(mktemp -d)"
"$METEOR_BIN" npm pack --silent --pack-destination "$METEOR_NPM_DIR" \
  "$METEOR_CHECKOUT/npm-packages/meteor-capacitor" \
  "$METEOR_CHECKOUT/npm-packages/meteor-rspack"
"$METEOR_BIN" npm install --save-dev "$METEOR_NPM_DIR"/*.tgz
```

Use `"$METEOR_BIN"` for the native commands below. Repeat the pack and install
commands after changing either npm package. These are local snapshots; remove
the machine-specific `file:` dependencies before committing a portable app.

### Upgrade early Capacitor 7 apps

Commit or back up your native projects first. Update core, CLI, and the selected
platform packages together, and choose compatible releases of each plugin:

```bash
meteor npm install @capacitor/core@^8.6.2 @capacitor/android@^8.6.2 @capacitor/ios@^8.6.2
meteor npm install --save-dev @capacitor/cli@^8.6.2
npx cap migrate
npx cap sync
```

Omit platform packages you do not use. Review the
[Capacitor 8 migration guide](https://capacitorjs.com/docs/updating/8-0), including
native deployment targets and Android Gradle changes. Meteor does not rewrite
existing native projects or silently upgrade an unsupported major.

### TypeScript applications

Capacitor participates in Meteor's opt-in package type generation. In an app with
a `tsconfig.json`, run `meteor types` and include `.meteor/types/packages.d.ts` in
the configuration's `files` list. See [Using core types](../../cli/using-core-types.md)
for the complete setup and migration from other type providers.

The generated declarations include `Meteor.isCapacitor` and the server-side
WebApp architecture detector hook. `Meteor.isCapacitor` is a boolean: it is true
inside a Capacitor native WebView and false in an ordinary browser or on the
server. The npm package `@meteorjs/capacitor` also ships types for `defineConfig`
and the native Hot Code Push plugin.

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

You can return any option supported by the [Capacitor configuration schema](https://capacitorjs.com/docs/config), including `appId`, `appName`, `plugins`, `ios`, `android`, `server`, `loggingBehavior`, `appendUserAgent`, and other standard Capacitor options.

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

## Migrate from Cordova

Migrate an existing app in a separate branch or copy so you can compare its
behavior with the Cordova version. Adding `capacitor` selects the native
integration; it does not translate `mobile-config.js`, install every application
plugin, or migrate existing native settings.

:::info
Use a Meteor release or checkout containing this integration and its matching
`@meteorjs/capacitor` runtime. During the experimental period, follow the
[checkout setup](#run-from-a-meteor-checkout) when linking local npm packages.
Installing Capacitor npm packages alone does not add the Meteor native provider.
:::

### Prepare the existing app

Run the app's existing browser and native checks before changing its native
integration. Record the Meteor release, npm lockfile, plugin versions and tested
platforms. Keep the same behavior assertions after migration.

Inventory the app's native requirements:

- Plugins in `.meteor/cordova-plugins`, npm dependencies and Atmosphere packages
  that declare `Cordova.depends`.
- Calls to Cordova globals, plugin APIs and `LaunchScreen`, including their
  browser fallbacks and startup behavior.
- `mobile-config.js`, plugin variables, native overrides, permissions, icons,
  splash resources, signing settings and environment-dependent configuration.
- Authentication, local storage, files, deep links and other state or platform
  registrations that an installed successor must preserve.

For example, `mobile-experience` implies `mobile-status-bar` and `launch-screen`,
which declare Cordova plugins. Include those implicit dependencies when deciding
which native behavior needs a compatible plugin or replacement.

Upgrade Meteor or the bundler separately when needed, then establish a working
baseline on the selected tool. Dependency peer conflicts belong to that setup
step. Keep the app's UI framework, server code and data model unchanged unless
the migration demonstrates a specific requirement.

### Preserve identity before generating projects

Recover the effective Android application ID and iOS bundle ID from the original
native projects or built artifacts, and compare them with any store records.
An app without `App.info({ id })` may use an identifier derived from Meteor's app
ID. Keep `.meteor/.id` and verify the effective native identity rather than
guessing it from the npm package name.

Add the integration:

``` bash
meteor add capacitor
```

Before running a native command, create or review `capacitor.config.js` with the
verified identity:

``` js
const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(() => ({
  appId: 'com.company.existingapp',
  appName: 'Existing App',
  ios: { contentInset: 'always' },
}));
```

Replace these example values with the original app's values. Preserve Android
`versionName` and `versionCode`, and iOS marketing and build versions, in the
native projects. Changing `appId` in JavaScript after project generation does
not rename an existing Android or Xcode project.

For an installed-app update, also preserve signing continuity, the iOS team,
entitlements and platform registrations. Matching the native ID alone does not
establish that an existing installation can upgrade successfully.

### Review Cordova plugins

Classify each plugin as compatible and retained, replaced with equivalent
behavior, no longer needed, or requiring additional migration work. Check
Capacitor 8 compatibility, platform minimums and any required native settings.
See [Capacitor's Cordova plugin support](https://capacitorjs.com/docs/plugins/cordova).

Capacitor looks for plugins in both `dependencies` and `devDependencies`.
A Cordova plugin kept in npm for the old app can therefore enter the new native
build. Meteor displays Capacitor's plugin list and warnings when it creates or
syncs a native project. Once the platform exists, run `npx cap ls ios` or
`npx cap ls android` to check what the next sync will include.

To keep a plugin installed for Cordova while excluding it from an iOS build,
set `ios.includePlugins` in your existing `capacitor.config.js` before adding
or syncing the platform. This example retains Meteor Hot Code Push and
InAppBrowser.

```js
const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(() => ({
  appId: 'com.company.existingapp',
  appName: 'Existing App',
  ios: {
    includePlugins: ['@meteorjs/capacitor', 'cordova-plugin-inappbrowser'],
  },
}));
```

Add each other plugin the iOS app uses. A platform's list takes precedence over
the top-level `includePlugins`. See the [Capacitor configuration reference](https://capacitorjs.com/docs/config).

Install a retained Cordova plugin through npm. Capacitor does not install it from
Meteor's `.meteor/cordova-plugins` list. For example, an app retaining
InAppBrowser 6 can use:

``` bash
meteor npm install --save-exact cordova-plugin-inappbrowser@6.0.0
```

Keep the existing call while validating compatibility on both platforms. For
`cordova.InAppBrowser.open(url, '_system')`, check that the device's external
browser opens and that returning leaves the app usable. An API that opens an
in-app browser changes that behavior.

Cordova installation variables, hooks and automatic native configuration are
not applied by Capacitor. Port the required settings from the plugin's
`plugin.xml` and instructions into the maintained native projects. New iOS
projects use Swift Package Manager (SPM). Check whether a retained plugin
declares native libraries through CocoaPods in its iOS `plugin.xml`. For example,
`cordova-plugin-purchases@8.0.0` declares `PurchasesHybridCommon` as a pod.
Capacitor can sync it successfully and Xcode can still fail to resolve that
module. Version 9.0.4 supplies a Swift package dependency for this library.
For a plugin that still requires pods, use a CocoaPods project or select an
SPM-compatible replacement. See
[Capacitor's SPM guidance](https://capacitorjs.com/docs/ios/spm).

### Translate mobile configuration

Review each setting by the behavior it controls. Similarly named Cordova and
Capacitor settings do not necessarily have the same consumer or effect.

| Cordova input | Capacitor migration |
|---|---|
| `App.info({ id, name })` | Set the initial `appId` and `appName`; preserve the effective identity in native source. |
| `App.info({ version, buildNumber })` | Carry Android version/code and iOS marketing/build settings into the maintained projects. |
| `App.setPreference(...)` | Use a supported Capacitor option, plugin configuration or native setting; document settings without an equivalent. |
| `App.configurePlugin(...)` | Install the compatible npm plugin and apply its required native configuration explicitly. |
| `App.icons(...)`, `App.launchScreens(...)` | Keep the original source assets and generate or configure the native icon and splash resources. |
| `App.accessRule(..., { type: 'navigation' })` | Review WebView navigation and narrowly scoped `server.allowNavigation` settings. |
| `App.accessRule(..., { type: 'network' })` | Review backend reachability, CORS/CSP, Android network security and iOS transport settings. |
| `App.accessRule(..., { type: 'intent' })` | Review external URL handling and required Android intents or iOS URL-scheme settings. |
| `App.appendToConfig(...)` | Translate the XML's purpose into native manifests, plists, entitlements or plugin configuration. |
| `App.addResourceFile(...)`, `cordova-build-override/` | Port each required resource or customization into native source. |
| `App.settings` or environment-dependent configuration | Pass the intended build inputs through explicit environment/configuration handling. The `defineConfig` context does not expose `App.settings`. |

See the [Capacitor configuration schema](https://capacitorjs.com/docs/config)
for supported options. A navigation allowlist does not grant network access or
replace transport-security settings.

For a Cordova `WebAppStartupTimeout` preference, set the native Meteor plugin's
startup/HCP recovery deadline explicitly, in milliseconds:

``` js
plugins: {
  CapacitorMeteorWebApp: {
    startupTimeout: 60000,
  },
},
```

Android and iOS default to 30000 milliseconds. Positive integers override that
default; zero or negative values retain it. The timer pauses while the app is in
the background. Sync and rebuild both native apps after changing the setting.

:::warning
The `startupTimeout` option requires the matching native-plugin implementation.
Earlier experimental runtimes hardcode a 30-second deadline and do not consume
this setting. The reference example's 60-second validation used a local native
follow-up that is not yet published; check the selected runtime before relying
on this mapping.
:::

Cordova's `LoadUrlTimeoutValue` is a separate WebView setting and does not map to
this deadline. Review whether its original purpose still applies when the app
starts from bundled web assets.

Review splash-screen and status-bar behavior separately from the configuration
mapping. A `plugins.SplashScreen` block does not install the corresponding npm
plugin. If the app controls splash hiding or system bars, use the selected
plugin or supported native API and check both themes, safe areas, notches and
gesture navigation. Preserve the intent of any existing `LaunchScreen.hold()`
calls before removing their Cordova implementation.

### Generate and maintain native projects

Keep existing Android and iOS entries in `.meteor/platforms`; removing and
re-adding them is unnecessary. Add a platform only if the app does not already
list it, after configuring the native identity.

Run the normal Meteor native commands. Meteor creates missing projects,
prepares its web assets and syncs the selected platform:

``` bash
# Android emulator
meteor run android --mobile-server http://10.0.2.2:3000
```

Stop that Meteor command before switching platforms in the same app copy:

``` bash
# iOS Simulator
meteor run ios --mobile-server http://localhost:3000
```

Use a reachable LAN address for physical devices or a backend shared between
platforms. Android's `10.0.2.2` alias does not identify the host for iOS. Run
Meteor build/test modes sequentially in one source copy so they do not overwrite
each other's generated entries; use a separate copy for concurrent workflows.

Review and commit the maintained `android/` and `ios/` projects. Keep copied web
assets, generated plugin wrappers, build caches and signing secrets out of
version control. Preserve native customizations when syncing or upgrading.
Only retire obsolete Cordova metadata and packages after their required behavior
has a validated replacement.

### Validate native behavior and installed-app updates

Run the existing application tests and exercise the native actions they do not
cover. Keep Android and iOS results separate:

| Boundary | What to check |
|---|---|
| Browser | Existing UI interactions, server data and ordinary web fallbacks still work. |
| Native runtime | Cold launch, actual plugin calls, permissions, external-app return and continued application use. |
| System UI | Splash behavior, light/dark mode, status bars, safe areas and gesture spacing. |
| Development | Client changes update the running native app and server changes preserve its connection and data behavior. |
| Bundled HCP | A real downloaded update activates, survives a cold relaunch and leaves the app usable. A livereload result is a separate check. |
| Existing installation | Install the correctly signed successor over the Cordova app without uninstalling; verify identity, stored data, authentication, permissions and platform registrations. |
| Release | Verify the actual APK/AAB/IPA format, identity and signatures independently of debug or Simulator builds. |

The Cordova and Capacitor WebView origins and storage locations can differ.
Inventory local storage, files, preferences and keychain use, then test a
deliberate transfer or reauthentication path. Keep the original native build
available for comparison. Replacing the installed native shell requires a native
release; an HCP-only update cannot perform that migration.

Record missing signing infrastructure or unavailable original builds as pending
validation. A successful fresh installation or a stateless example cannot prove
that an existing production app retains its state.

### Worked migration example

The [welcome-meteor-cordova transition](https://github.com/CloudByGalaxy/welcome-meteor-cordova/pull/4)
uses the same React UI, collection, publication, counter and original Maestro
flows as its Cordova baseline. It retains InAppBrowser 6 through npm, preserves
the native identity and versions, and adds external-browser/return and real HCP
checks on Android and iOS.

The example's [migration record](https://github.com/CloudByGalaxy/welcome-meteor-cordova/blob/capacitor-transition/MIGRATION.md)
contains its application-specific changes, selected versions, commands and
validation limits. Use this guide for the general process and the example for a
concrete comparison. It does not establish state preservation for apps with
authentication, offline data or other native integrations.

### Report migration issues

When testing the experimental integration, include the Meteor release or
checkout revision, Capacitor and plugin versions, native tooling and OS versions,
the command that failed, and the expected and observed behavior in a
[Meteor issue](https://github.com/meteor/meteor/issues/new). State whether the
problem occurs on a fresh install, an installed-app upgrade or HCP, and attach a
minimal reproduction or the relevant configuration and logs without credentials.

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

On Android emulator, that usually means passing `--mobile-server http://10.0.2.2:3000`:

``` bash
meteor run android --mobile-server http://10.0.2.2:3000
```

`10.0.2.2` is Android emulator's special alias for the host machine. Meteor cannot infer that alias from your host network interfaces, so explicit `--mobile-server` is expected for this case. Bare `host:port` values remain supported and are normalized to HTTP, but a full URL keeps the intended protocol clear.

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
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server http://10.0.2.2:3000
```

For physical devices, use an address reachable from the same network, such as your development machine's LAN IP.

Set `METEOR_CAPACITOR_MODE=livereload` when you want the native app to load directly from the running Meteor server.

Blaze template changes use Meteor's existing reload flow to update the running
WebView. You do not need to refresh or relaunch the native app after editing a
template. Server code changes restart the Meteor server automatically.

### Connection URL detection

Most apps do not need to set the LAN IP manually. In native runs, `@meteorjs/capacitor` uses the URL Meteor provides for the native run. Passing `--mobile-server` is the supported way to make that URL explicit when a device needs a specific reachable host.

When no explicit URL is available, the helper can fall back to a local network address and the current app port. Autodetection can choose the wrong interface when your machine has multiple network adapters, VPNs, Docker networks, or isolated emulator networking. Android emulator is separate special case: its reachable host alias is `10.0.2.2`, not your machine's detected LAN IP. In those cases, pass a reachable URL with `--mobile-server`:

``` bash
meteor run android --mobile-server http://10.0.2.2:3000
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server http://10.0.2.2:3000
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server http://192.168.1.4:3000
```

### Run on a device

Use the native device targets when you want to run on a connected physical device:

``` bash
# Android physical device
meteor run android-device

# iOS physical device (macOS only)
meteor run ios-device
```

Meteor selects a target automatically when exactly one device is online. Running
Android emulators and booted iOS simulators count as online targets. When the
selection is ambiguous, Capacitor prompts in an interactive terminal. In CI or
headless runs, set an explicit target if there is no single online device.

List target IDs with Capacitor, then select one with `METEOR_CAPACITOR_TARGET`:

``` bash
npx cap run android --list
METEOR_CAPACITOR_TARGET=emulator-5554 meteor run android

npx cap run ios --list
METEOR_CAPACITOR_TARGET=SIMULATOR_UUID meteor run ios
```

An explicit target takes precedence over automatic selection and can start an
available simulator. `METEOR_CAPACITOR_AUTO_PICK_TARGET` is no longer needed;
existing scripts can keep it, but it does not select the first listed target.

Set `METEOR_CAPACITOR_SKIP_NATIVE_RUN=1` to prepare and sync the native project
without launching it. Meteor still starts the development server:

``` bash
METEOR_CAPACITOR_SKIP_NATIVE_RUN=1 meteor run android
```

You can pass other Capacitor run options with `METEOR_CAPACITOR_*` environment
variables, such as `METEOR_CAPACITOR_FLAVOR` or `METEOR_CAPACITOR_TARGET_NAME`.

### Debug the WebView

If the app stays on its startup screen, keep `meteor run` running and inspect
the WebView's Console and Network panels. These steps work in bundled and
livereload modes.

- On **iOS**, enable developer features in Safari on your Mac. In Safari's
  **Develop** menu, select the simulator or connected device, then the page
  under your app's name. For a physical device, also enable **Web Inspector**
  in the device's Safari settings under **Advanced**. Capacitor enables
  `WKWebView.isInspectable` in native Debug builds on iOS 16.4 and later.
  If the app overrides this default, check `ios.webContentsDebuggingEnabled`
  in `capacitor.config.*` and sync and rebuild after changing it.
  [Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios)
- On **Android**, open `chrome://inspect/#devices` in desktop Chrome, find the
  running app on the emulator or USB-connected device, and select **inspect**.
  [Remote debugging WebViews](https://developer.chrome.com/docs/devtools/remote-debugging/webviews)

To capture `console.error` from the start of an iOS Simulator launch, run the
following in a second terminal after `meteor run ios` has installed the app.
Replace the example with the installed app's bundle identifier. The command
relaunches the app and attaches the terminal to its output. Capacitor writes
WebView console messages there when native logging is enabled (the Debug default).

```bash
xcrun simctl launch --terminate-running-process --console-pty booted com.example.myapp
```

If several simulators are booted, use the target simulator's UUID in place of
`booted`.

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

The Capacitor package transforms the native web bundle into `_build/native-prod`,
runs `cap sync`, then runs the app's installed `cap build` for each selected
platform. Native artifacts are written to `../build-output/android/` or
`../build-output/ios/`, and Meteor prints their paths. If you omit `--platforms`,
Meteor builds the configured native platforms. It creates missing native projects
and reuses existing ones.

Pass platform names separated by commas to build both Android and iOS:

``` bash
meteor build ../build-output --server=https://your-server-url.com --platforms=android,ios
```

Set Android flavors, iOS schemes, and platform `buildOptions` in
`capacitor.config.*`, including signing and export settings. Use a JavaScript or
TypeScript configuration file to read environment variables. Meteor excludes
signing settings from the generated web configuration.

Android builds use `android.buildOptions.releaseType`, which defaults to AAB.
Pass `--packageType=bundle` for AAB or `--packageType=apk` for APK to override it.
`--directory` writes the server bundle as a directory, and `--architecture`
selects the server architecture. Native artifacts are written alongside the
server bundle.

`--debug` builds Meteor's web assets in debug mode and creates an Android debug
build using the project's Gradle wrapper. On iOS, it selects the Debug
configuration for the device archive and IPA export. iOS device builds require
signing, including Debug builds. An IPA cannot be installed in the iOS Simulator.
Native compilation, signing, or missing artifacts cause `meteor build` to fail.

See the [`meteor build` reference](../../cli/index.md#meteorbuild) for the shared
build options, including `--mobile-settings` and `--server-only`.

Capacitor 8.6.2 uses SHA-1 when signing with `jarsigner`. JDK 21 does not accept
these signatures, so AAB release verification fails. For APK releases, set
`android.buildOptions.signingType` to `'apksigner'`. See the
[upstream signing issue](https://github.com/ionic-team/capacitor/issues/8428) for details.

The `capacitor` package enables this build flow. Cordova apps keep their existing
build flow, including the iOS project export.

Native builds require an explicit server URL. `--server` takes precedence over
`MOBILE_ROOT_URL` and `ROOT_URL`; local network discovery is reserved for development
runs. Meteor passes the same URL to the Capacitor configuration factory, the
bundle's `ROOT_URL` and DDP endpoint, and native synchronization. URL path prefixes
are preserved. Directory and tarball builds follow the same flow.

Web-only builds (`--platforms=web.browser`), `--server-only`, and deployment skip
native preparation. Generated `android/`, `ios/`, and native web directories are
excluded from application source scanning during subsequent web commands.

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

`Meteor.isCordova` also remains true because the integration uses Meteor's
`web.cordova` architecture. It does not guarantee that a particular Cordova
plugin global or lifecycle API is available. Use `Meteor.isCapacitor` for
Capacitor-specific behavior and check the APIs the app actually uses.

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

The [Cordova migration workflow](#migrate-from-cordova) will be refined as beta
feedback identifies additional application and plugin requirements.
