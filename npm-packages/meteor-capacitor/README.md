# @meteorjs/capacitor

Configuration helpers for using [CapacitorJS](https://capacitorjs.com) with Meteor. Companion package to the Meteor `capacitor` build plugin.

## Usage

```js
// capacitor.config.js
const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.example.myapp',
  appName: 'MyApp',
  server: Meteor.isLivereload
    ? { url: Meteor.rootUrl }
    : undefined,
}));
```

`defineConfig` deep-merges your config on top of Meteor defaults — nested objects layer rather than replace, so adding `plugins.Camera: { … }` won't clobber Meteor's `plugins.SplashScreen` defaults.

**Defaults applied:**

| Key | Default |
|---|---|
| `webDir` | `Meteor.webDir` (per-env subfolder under `Meteor.buildContext`) |
| `bundledWebRuntime` | `false` (reserved — Meteor needs this; user values are warned and ignored) |
| `plugins.SplashScreen.launchAutoHide` | `true` |

The factory receives a `Meteor` flag object populated from process.env (set by the Meteor `capacitor` build plugin):

| Flag | Meaning |
|---|---|
| `Meteor.isDevelopment` / `Meteor.isProduction` | Build mode |
| `Meteor.isLivereload` / `Meteor.isBundled` | Capacitor render mode |
| `Meteor.isNativeAndroid` / `Meteor.isNativeIos` | Active platform |
| `Meteor.isCapacitor` / `Meteor.isNative` | Always true here |
| `Meteor.rootUrl` / `Meteor.localIp` / `Meteor.port` | Connection details for `server.url` |
| `Meteor.platform` | `'android'` or `'ios'` |
| `Meteor.mode` | `'livereload'` / `'bundled'` |
| `Meteor.buildContext` | Build root (matches `RSPACK_BUILD_CONTEXT`, e.g. `_build`) |
| `Meteor.webDir` | Per-env subfolder (`<buildContext>/native-dev`, `native-prod`) |
