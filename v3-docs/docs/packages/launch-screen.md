# launch-screen

`launch-screen` is a mobile-only package that lets you postpone when your app's launch (splash) screen is removed and your app becomes visible. For example, you can avoid showing the user a blank white page while your UI renders for the first time.

```bash
meteor add launch-screen
```

The package bundles the `cordova-plugin-splashscreen` Cordova plugin (verified in `packages/launch-screen/package.js`) and only has an effect in a native Cordova build.

## Basic behavior

No special configuration is required. When the package is added, the app holds the launch screen until the `body` template is rendered. (If you use iron:router, it instead waits until the first route is rendered.)

## Holding the launch screen longer

If you need to wait for additional UI to be ready before revealing the app, call `LaunchScreen.hold()` at the top level of your client code. It returns a handle; call `handle.release()` when you are ready.

### `LaunchScreen.hold()`

Reserves the launch screen and returns a handle object.

- Returns: a handle with a `release()` method.

You can call `LaunchScreen.hold()` multiple times (from your app or from packages). The launch screen is removed only once `release()` has been called on **all** outstanding handles.

```js
// in a client-only JavaScript file
const handle = LaunchScreen.hold();

Template.myUI.onRendered(function () {
  handle.release();
});
```

`LaunchScreen` is exported by the package (`api.export('LaunchScreen')`), so it is available as a global on the client.

## Configuring the splash image

This package controls **when** the launch screen is dismissed. The launch (splash) **image** itself is configured in your `mobile-config.js` with `App.launchScreens(...)`, which maps device/size keys to image paths in your app:

```js
// mobile-config.js
App.launchScreens({
  ios_universal: 'splash/ios_universal.png',       // 2732x2732
  ios_universal_3x: 'splash/ios_universal_3x.png', // 2208x2208
  android_universal: 'splash/android_universal.png',
});
```

The keys are device/size identifiers (e.g. `ios_universal`, `ios_universal_3x`, `android_universal`). See the [Cordova guide](../about/cordova.md) for the full list of supported keys and recommended image sizes.

## See also

- `mobile-experience` — umbrella package that includes `launch-screen`.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
