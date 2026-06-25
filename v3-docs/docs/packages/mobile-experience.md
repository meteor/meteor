# mobile-experience

`mobile-experience` is an umbrella package that pulls in a set of Cordova/PhoneGap-specific packages providing good defaults when building a native mobile app. These packages only take effect when you build a native Android or iOS app.

```bash
meteor add mobile-experience
```

## What it includes

Adding `mobile-experience` implies the following packages (verified in `packages/mobile-experience/package.js`):

- **`mobile-status-bar`** — implied on the `web.cordova` architecture; provides a nicer appearance for the status bar so it doesn't cover up your app content.
- **`launch-screen`** — implied everywhere; shows a launch (splash) image while your app's UI is loading. It does nothing without Cordova, but is included on every architecture so you don't need to wrap your `LaunchScreen` calls in platform checks.

Because this package simply re-exports those two, you can add it instead of adding each one individually. There is no API of its own.

## See also

- `mobile-status-bar` — status bar configuration for Cordova apps.
- `launch-screen` — control the mobile launch/splash screen.
- [Cordova](../about/cordova.md) — building mobile apps with Meteor.
