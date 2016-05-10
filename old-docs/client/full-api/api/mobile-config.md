{{#template name="apiMobileConfig"}}


<h2 id="mobileconfigjs"><span>Mobile Config File</span></h2>

If your Meteor application targets mobile platforms such as iOS or
Android, you can configure your app's metadata and build process
in a special top-level file called
`mobile-config.js` which is *not* included in your application and is used only
for this configuration.

The code snippet below is an example `mobile-config.js` file. The rest of this
section will explain the specific API commands in greater detail.

```javascript
// This section sets up some basic app metadata,
// the entire section is optional.
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
  'iphone': 'icons/icon-60.png',
  'iphone_2x': 'icons/icon-60@2x.png',
  // ... more screen sizes and platforms ...
});

App.launchScreens({
  'iphone': 'splash/Default~iphone.png',
  'iphone_2x': 'splash/Default@2x~iphone.png',
  // ... more screen sizes and platforms ...
});

// Set PhoneGap/Cordova preferences
App.setPreference('BackgroundColor', '0xff0000ff');
App.setPreference('HideKeyboardFormAccessoryBar', true);
App.setPreference('Orientation', 'default');
App.setPreference('Orientation', 'all', 'ios');

// Pass preferences for a particular PhoneGap/Cordova plugin
App.configurePlugin('com.phonegap.plugins.facebookconnect', {
  APP_ID: '1234567890',
  API_KEY: 'supersecretapikey'
});
```


{{> autoApiBox "App.info"}}
{{> autoApiBox "App.setPreference"}}
{{> autoApiBox "App.accessRule"}}
{{> autoApiBox "App.configurePlugin"}}
{{> autoApiBox "App.icons"}}
{{> autoApiBox "App.launchScreens"}}
{{/template}}
