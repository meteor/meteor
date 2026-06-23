---
outline:
  level: [2, 3]
---

# Native Stack

**Meteor's native stack** helps you ship web applications inside native mobile shells while keeping Meteor's build, reload, and deployment model.

**The native stack includes:**

1. **Capacitor (mobile).** Capacitor wraps your Meteor web bundle in native iOS and Android projects. Meteor prepares a native web bundle, syncs it into Capacitor, and keeps Hot Code Push available through a native runtime.

2. **Cordova (Legacy mobile).** Cordova remains documented for existing apps that already use Meteor's legacy mobile integration. New native mobile work should use Capacitor.

## Quick start

Before running native apps, install the Android and iOS tooling described in [**"Native Pre-Installation"**](./native-stack/pre-installation.md).

### Capacitor (mobile)

Add this Atmosphere package to your app:

``` bash
meteor add capacitor
```

Then add and run a native platform:

``` bash
# Android
meteor add-platform android
meteor run android

# iOS (macOS only)
meteor add-platform ios
meteor run ios
```

The Capacitor integration creates a `capacitor.config.js` file when needed, installs the required Capacitor npm dependencies when automatic npm installation is enabled, transforms Meteor's native web bundle into a Capacitor `webDir`, and runs `cap sync`.

By default, `meteor run android` and `meteor run ios` use bundled mode with Meteor Hot Code Push enabled. The app starts from local assets and can receive updated web assets from the Meteor server.

> See the [**"Capacitor (mobile)"** section](./native-stack/capacitor-mobile.md) for requirements, configuration, run modes, HCP behavior, and production build notes.

### Cordova (Legacy mobile)

Use the legacy Cordova section when you maintain an existing Cordova app or need historical Cordova mobile setup details.

> See the [**"Cordova (Legacy mobile)"** section](./cordova.md) for legacy setup, development, HCP, and production build notes.

## Learn more

📄 [Hot Code Push on mobile](/troubleshooting/hot-code-push) — Troubleshooting guide for Meteor's mobile update flow.
