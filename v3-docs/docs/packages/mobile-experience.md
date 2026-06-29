# mobile-experience

`mobile-experience` is an umbrella package that pulls in a set of Cordova/PhoneGap-specific packages providing good defaults when building a native mobile app. These packages only take effect when you build a native Android or iOS app.

```bash
meteor add mobile-experience
```

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `mobile-experience` exposes no JavaScript API of its own; it just pulls in `mobile-status-bar` and `launch-screen` (see below) so you get their good defaults automatically. Any optional configuration belongs to those individual packages — for example, status-bar preferences are set in `mobile-config.js` using `App.setPreference(...)`.

## What it includes

Adding `mobile-experience` implies the following packages:

- **`mobile-status-bar`** — implied on the `web.cordova` architecture; provides a nicer appearance for the status bar so it doesn't cover up your app content.
- **`launch-screen`** — implied everywhere; shows a launch (splash) image while your app's UI is loading. It does nothing without Cordova, but is included on every architecture so you don't need to wrap your `LaunchScreen` calls in platform checks.

Because this package simply implies those two packages, you can add it instead of adding each one individually. There is no API of its own.

## Configuring the pieces

`mobile-experience` itself has nothing to configure, but the packages it includes do:

- **Status bar:** set preferences in `mobile-config.js`, e.g. [`App.setPreference('StatusBarBackgroundColor', '#000000')`](../api/app.md).
- **Launch screen:** set the splash images with [`App.launchScreens({...})`](../api/app.md) in `mobile-config.js`, and use `LaunchScreen.hold()` / `handle.release()` in client code to control when the splash is dismissed.

## See also

- [`mobile-status-bar`](./mobile-status-bar.md) — status bar configuration for Cordova apps.
- [`launch-screen`](./launch-screen.md) — control the mobile launch/splash screen.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
