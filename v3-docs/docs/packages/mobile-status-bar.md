# mobile-status-bar

`mobile-status-bar` lets you customize the status bar in Meteor Cordova/PhoneGap apps — for example, to keep the status bar from covering up your app content.

```bash
meteor add mobile-status-bar
```

## Usage

**Adding the package is enough to get its sensible status-bar defaults — no setup is required.** The package exposes no JavaScript API. Configuration is **optional**: if you want to change the status bar's appearance, set preferences in your `mobile-config.js` file (see [Configuration](#configuration) below). It only has an effect in a native Cordova build.

## How it works

The package bundles the standard [`cordova-plugin-statusbar`](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md) Cordova plugin with some sensible defaults (verified in `packages/mobile-status-bar/package.js`, which declares `Cordova.depends({ 'cordova-plugin-statusbar': '...' })`). It only takes effect in a native Cordova build.

## Configuration

You set status bar preferences in your app's [`mobile-config.js`](https://docs.meteor.com/api/mobile-config.html) file using `App.setPreference`, for example:

```js
App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
```

For the full list of available preferences and the runtime `StatusBar` plugin API, see the [`cordova-plugin-statusbar` documentation](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md).

## See also

- `mobile-experience` — umbrella package that includes `mobile-status-bar`.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
