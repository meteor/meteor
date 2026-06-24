# @meteorjs/capacitor

CapacitorJS integration helpers and native runtime bindings for Meteor's `capacitor` mobile flow.

This package is the npm companion to Meteor's `capacitor` package. Meteor uses it to:

- build and merge `capacitor.config.*` with Meteor-specific defaults
- provide the native `WebAppLocalServer` bridge used by Meteor Hot Code Push
- expose a small client runtime for Capacitor startup and update handling

## Quick start

Add the Meteor package to your app:

```bash
meteor add capacitor
```

Then configure Capacitor from your app root:

```js
// capacitor.config.js
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

Run the native app with Meteor:

```bash
meteor add-platform android
meteor run android

# iOS on macOS
meteor add-platform ios
meteor run ios
```

On first use, Meteor prepares the Capacitor project, writes or reuses the app config, creates the generated native web directory, and runs `cap sync`.

## Config files

Meteor scaffolds a CommonJS `capacitor.config.js` file when one is missing.

If your app already has one of these files, Meteor respects it instead:

- `capacitor.config.ts`
- `capacitor.config.mjs`
- `capacitor.config.cjs`
- `capacitor.config.json`

Meteor may also write a generated `capacitor.config.json` snapshot under `_build/native-*`. That generated file is not the source file you maintain.

## `defineConfig`

`defineConfig` accepts either:

- a config object
- a factory `(Meteor) => config`

Meteor defaults are layered under your config, then nested objects are deep-merged. This means adding `plugins.Camera` does not remove Meteor's default `plugins.SplashScreen` values.

Meteor keeps end-to-end control over a small reserved surface:

- `bundledWebRuntime` is always forced to `false`

If you set a conflicting value for a reserved key, `@meteorjs/capacitor` warns and ignores the user value.

You can return any option supported by the Capacitor config schema for the Capacitor version installed in your app, including `appId`, `appName`, `plugins`, `ios`, `android`, `server`, `loggingBehavior`, and `appendUserAgent`.

Most apps do not need to set `server` manually. Meteor derives the correct default server behavior for bundled and livereload modes.

## Defaults applied by Meteor

| Key | Default |
| --- | --- |
| `webDir` | `Meteor.webDir` |
| `bundledWebRuntime` | `false` |
| `plugins.SplashScreen.launchAutoHide` | `true` |
| `server.androidScheme` | `'http'` |
| `server.cleartext` | `true` during `meteor run`, or when `Meteor.rootUrl` starts with `http://` |
| `server.url` in livereload mode | `Meteor.rootUrl` when available, otherwise `http://<Meteor.localIp>:<Meteor.port>` with the path rewritten to `/__cordova/` |

In bundled mode, the default `server` block omits `url`, so Capacitor falls back to loading from `webDir`.

## `Meteor` context

The `defineConfig` factory receives a `Meteor` object populated from process environment variables set by Meteor's `capacitor` tooling.

| Flag | Type | Description |
| --- | --- | --- |
| `isDevelopment` | `boolean` | True when preparing development native web assets. |
| `isProduction` | `boolean` | True when preparing production native web assets. |
| `isDebug` | `boolean` | True when Meteor debug mode is enabled. |
| `isVerbose` | `boolean` | True when verbose Meteor logging is enabled. |
| `isRun` | `boolean` | True when running through `meteor run`. |
| `isBuild` | `boolean` | True when running through `meteor build`. |
| `isCapacitor` | `boolean` | Always `true` inside this helper. |
| `isNative` | `boolean` | Always `true` inside this helper. |
| `isNativeAndroid` | `boolean` | True when the active platform is Android. |
| `isNativeIos` | `boolean` | True when the active platform is iOS. |
| `platform` | `'android' \| 'ios' \| ''` | Active native platform. |
| `mode` | `'bundled' \| 'livereload'` | Capacitor render mode. |
| `isBundled` | `boolean` | True when the app starts from local bundled assets. |
| `isLivereload` | `boolean` | True when the app loads directly from the Meteor server. |
| `rootUrl` | `string` | The server URL supplied by Meteor, including `--mobile-server`. |
| `localIp` | `string` | Auto-detected fallback address used when no explicit server URL is available. |
| `port` | `string` | App port, usually `3000`. |
| `buildContext` | `string` | Generated build root, usually `_build`. |
| `webDir` | `string` | Generated web directory, such as `_build/native-dev` or `_build/native-prod`. |

## Run modes

Bundled mode is the default for `meteor run android` and `meteor run ios`. In bundled mode, the WebView starts from local web assets and Meteor Hot Code Push remains available.

Livereload mode makes the WebView load from the running Meteor server instead:

```bash
METEOR_CAPACITOR_MODE=livereload meteor run android
METEOR_CAPACITOR_MODE=livereload meteor run ios
```

When a device or emulator needs an explicit reachable host, pass `--mobile-server`:

```bash
METEOR_CAPACITOR_MODE=livereload meteor run android --mobile-server 10.0.2.2:3000
```

If no explicit URL is available, the helper falls back to `Meteor.localIp` and `Meteor.port`. On machines with multiple interfaces, VPNs, or container networks, `--mobile-server` is the supported way to force the correct address.

## Hot Code Push

Meteor's built-in Hot Code Push is enabled by default in bundled mode:

```json
{
  "meteor": {
    "capacitor": {
      "hcp": "webapp"
    }
  }
}
```

You can omit that setting because `"webapp"` is the default. `true` is also accepted and maps to `"webapp"`.

To disable Meteor-managed HCP and keep a static bundled app, use either `false` or `"none"`:

```json
{
  "meteor": {
    "capacitor": {
      "hcp": false
    }
  }
}
```

With HCP disabled, Meteor injects a no-op `WebAppLocalServer` shim so native startup calls still succeed.

## Client runtime

This package also exports a small client runtime:

- `bootCapacitor(options?)`
- `CapacitorMeteorWebApp`
- `MeteorWebAppError`

### `bootCapacitor(options?)`

`bootCapacitor()` is a convenience helper for Capacitor app startup. On a native platform it can:

- register an `updateAvailable` listener and auto-reload into downloaded HCP assets
- call `startupDidComplete()` on the native Meteor bridge
- hide the Capacitor splash screen
- register Ionic PWA elements when available

Options:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `hideSplash` | `boolean` | `true` | Hide `@capacitor/splash-screen` during startup. |
| `defineCustomElements` | `boolean` | `true` | Register `@ionic/pwa-elements` when present. |
| `hcpAutoReload` | `boolean` | `true` | Auto-reload when the native bridge emits `updateAvailable`. |

### `CapacitorMeteorWebApp`

`CapacitorMeteorWebApp` is the native plugin bridge used by Meteor mobile updates. It exposes methods such as:

- `startupDidComplete()`
- `checkForUpdates()`
- `getCurrentVersion()`
- `isUpdateAvailable()`
- `reload()`
- `addListener('updateAvailable', ...)`
- `addListener('error', ...)`

In a plain web environment, the package provides a safe fallback implementation so importing it does not crash outside Capacitor.

### `MeteorWebAppError`

`MeteorWebAppError` exposes these error codes:

- `DOWNLOAD_FAILED`
- `VALIDATION_FAILED`
- `BLACKLISTED_VERSION`
- `STARTUP_TIMEOUT`
- `FILE_SYSTEM_ERROR`
