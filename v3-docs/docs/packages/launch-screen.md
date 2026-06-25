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

> Two edge cases: if `Template.body` never renders, the launch screen auto-releases after about 6 seconds as a safety net; and calling `LaunchScreen.hold()` **after** the screen has already been hidden throws `"Can't show launch screen once it's hidden"`, so always call `hold()` at the top level of your client code, not asynchronously.

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

**Dark mode (iOS):** an iOS splash entry can be an object with separate light/dark images:

```js
App.launchScreens({
  ios_universal: { src: 'splash/light.png', srcDarkMode: 'splash/dark.png' },
});
```

**Android:** the only Android key is `android_universal`, which maps to the Android 12+ animated-icon splash (a `288x288 dp` icon, e.g. a Vector Drawable or PNG) rather than a full-screen image.

Paths are relative to your project root. Unknown keys don't error — they emit a build warning and are passed through. The exact set of iOS keys and their pixel sizes is documented in the `App.launchScreens` API.

## See also

- `mobile-experience` — umbrella package that includes `launch-screen`.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
