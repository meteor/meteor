---
title: Mobile Configuration
description: Documentation of Meteor's Cordova configuration API.
---

If your Meteor application targets mobile platforms such as iOS or
Android, you can configure your app's metadata and build process
in a special top-level file called
`mobile-config.js` which is *not* included in your application and is used only
for this configuration.

The code snippet below is an example `mobile-config.js` file. The rest of this
section will explain the specific API commands in greater detail.

```js
// This section sets up some basic app metadata, the entire section is optional.
App.info({
  id: 'com.example.matt.uber',
  name: 'über',
  description: 'Get über power in one button click',
  author: 'Matt Development Group',
  email: 'contact@example.com',
  website: 'http://example.com'
});

// Set up resources such as icons and launch screens.
App.icons({
  'iphone_2x': 'icons/icon-60@2x.png',
  'iphone_3x': 'icons/icon-60@3x.png',
  // More screen sizes and platforms...
});

App.launchScreens({
  'iphone_2x': 'splash/Default@2x~iphone.png',
  'iphone5': 'splash/Default~iphone5.png',
  // More screen sizes and platforms...
});

// Set PhoneGap/Cordova preferences.
App.setPreference('BackgroundColor', '0xff0000ff');
App.setPreference('HideKeyboardFormAccessoryBar', true);
App.setPreference('Orientation', 'default');
App.setPreference('Orientation', 'all', 'ios');

// Pass preferences for a particular PhoneGap/Cordova plugin.
App.configurePlugin('com.phonegap.plugins.facebookconnect', {
  APP_ID: '1234567890',
  API_KEY: 'supersecretapikey'
});

// Add custom tags for a particular PhoneGap/Cordova plugin to the end of the
// generated config.xml. 'Universal Links' is shown as an example here.
App.appendToConfig(`
  <universal-links>
    <host name="localhost:3000" />
  </universal-links>
`);
```

{% apibox "App.info" %}
{% apibox "App.setPreference" %}
{% apibox "App.accessRule" %}

For example this Cordova whitelist syntax:

```xml
<access origin="https://www.google-analytics.com" />
<allow-navigation href="https://example.com" />
```

is equivalent to:

```js
App.accessRule('https://www.google-analytics.com');
App.accessRule('https://example.com', { type: 'navigation' });
```

{% apibox "App.configurePlugin" %}

> Note: When using `App.configurePlugin` to re-configure a plugin which has been previously configured, the changes may not be reflected without manually clearing the existing Cordova build.  To clear the existing Cordova build, remove the `.meteor/local/cordova-build` directory and re-build the application using either `meteor run` or `meteor build`.

{% apibox "App.icons" %}
{% apibox "App.launchScreens" %}
{% apibox "App.appendToConfig" %}
