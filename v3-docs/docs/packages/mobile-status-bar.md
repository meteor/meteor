# mobile-status-bar

`mobile-status-bar` lets you customize the status bar in Meteor Cordova/PhoneGap apps — for example, to keep the status bar from covering up your app content.

```bash
meteor add mobile-status-bar
```

## Usage

**Adding the package is enough to get its sensible status-bar defaults — no setup is required.** The package exposes no JavaScript API. Configuration is **optional**: if you want to change the status bar's appearance, set preferences in your `mobile-config.js` file (see [Configuration](#configuration) below). It only has an effect in a native Cordova build.

## How it works

The package bundles the standard [`cordova-plugin-statusbar`](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md) Cordova plugin (pinned via `Cordova.depends` in `packages/mobile-status-bar/package.js`). It only takes effect in a native Cordova build.

## Configuration

You set status bar preferences in your app's [`mobile-config.js`](https://docs.meteor.com/api/mobile-config.html) file using `App.setPreference`, for example:

```js
App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
```

For the full list of available preferences and the runtime `StatusBar` plugin API, see the [`cordova-plugin-statusbar` documentation](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md).

### Common preferences

Some of the most frequently used `cordova-plugin-statusbar` preferences:

- `StatusBarOverlaysWebView` — `true`/`false`; whether the web view extends under the status bar.
- `StatusBarBackgroundColor` — a hex color such as `#000000` for the status bar background.
- `StatusBarStyle` — `default`, `lightcontent`, `blacktranslucent`, or `blackopaque`.

```js
// mobile-config.js
App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
App.setPreference('StatusBarStyle', 'lightcontent');
```

For the complete list of preferences and the runtime `StatusBar` JavaScript API, refer to the [`cordova-plugin-statusbar` documentation](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md).

### Platform-specific preferences

`App.setPreference` accepts an optional third argument to scope a preference to one platform:

```js
App.setPreference('StatusBarStyle', 'lightcontent', 'ios');
```

This matters because several status-bar preferences are **iOS-only** (e.g. `StatusBarOverlaysWebView`, `StatusBarStyle`), while `StatusBarBackgroundColor` is the main one that affects Android. Values are passed as **strings** (`'false'`, not `false`). Changes to `mobile-config.js` require a rebuild to take effect.

## See also

- `mobile-experience` — umbrella package that includes `mobile-status-bar`.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
