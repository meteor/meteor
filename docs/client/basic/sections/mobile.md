{{#template name="basicMobile"}}

## Building Mobile Apps

Once you've built your web app with Meteor, you can easily build a native
wrapper for your app and publish it to the Google Play Store or iOS App Store
with just a few commands. We've put a lot of work into making the same packages
and APIs work on desktop and mobile, so that you don't have to worry about a lot
of the edge cases associated with mobile app development.

### Installing mobile SDKs

Install the development tools for Android or iOS with one command:

```bash
meteor install-sdk android     # for Android
meteor install-sdk ios         # for iOS
```

### Adding platforms

Add the relevant platform to your app:

```bash
meteor add-platform android    # for Android
meteor add-platform ios        # for iOS
```

### Running on a simulator

```bash
meteor run android             # for Android
meteor run ios                 # for iOS
```

### Running on a device

```bash
meteor run android-device      # for Android
meteor run ios-device          # for iOS
```

### Configuring app icons and metadata

You can configure your app's icons, title, version number, splash screen, and other metadata with the special [`mobile-config.js` file](#/full/mobileconfigjs).

Learn more about Meteor's mobile support on the [GitHub wiki page](https://github.com/meteor/meteor/wiki/Meteor-Cordova-Phonegap-integration).

{{/template}}