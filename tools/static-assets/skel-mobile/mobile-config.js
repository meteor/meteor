const version = '1.0.0';
const [major, minor, patch] = version.split('.');
// eslint-disable-next-line no-mixed-operators
const buildNumber = `${major * 10000 + minor * 1000 + patch * 100}`;

let idName = null;
let oneSignalAppId = '';
let urlUniversalLink = null;
let schemeUniversalLink = 'https';

// noinspection ThisExpressionReferencesGlobalObjectJS
switch (this.process.env.MOBILE_APP_ID) {
  case 'com.meteorapp.mobile':
    // eslint-disable-next-line no-console
    console.log('--> mobile-config - production build');
    idName = {
      id: 'com.meteorapp.mobile',
      name: 'mobile',
    };
    oneSignalAppId = 'a4a5axxx-59f2-493f-abdb-efce7b0c8ef6';
    urlUniversalLink = 'mobile.meteorapp.com';
    break;
  case 'com.meteorapp.stagingmobile':
    // eslint-disable-next-line no-console
    console.log('--> mobile-config - staging build');
    idName = {
      id: 'com.meteorapp.stagingmobile',
      name: 'mobileS',
    };
    oneSignalAppId = '7b357xxx-6509-48e4-b0e1-60f8f5f116a2';
    urlUniversalLink = 'stagingmobile.meteorapp.com';
    break;
  default:
    // eslint-disable-next-line no-console
    console.log('--> mobile-config - development build');
    idName = {
      id: 'localhost.mobile',
      name: 'mobileD',
    };
    urlUniversalLink = 'localhost:5000';
    schemeUniversalLink = 'http';
}

// eslint-disable-next-line no-undef
App.info(
  Object.assign(
    {
      version,
      buildNumber,
      description: '',
      author: 'Meteor',
      email: 'hello@meteorapp.com',
      website: 'meteor.com',
    },
    idName
  )
);

// eslint-disable-next-line no-undef
App.setPreference('BackgroundColor', '0xfffdab13');
// eslint-disable-next-line no-undef
App.setPreference('StatusBarBackgroundColor', '#fdab13');
// eslint-disable-next-line no-undef
App.setPreference('StatusBarStyle', 'lightcontent');

// needs to be lower case because of iOS
// eslint-disable-next-line no-undef
App.setPreference('onesignalappid', oneSignalAppId);
// eslint-disable-next-line no-undef
App.setPreference(
  'universallink',
  `${schemeUniversalLink}://${urlUniversalLink}`
);
// eslint-disable-next-line no-undef
App.setPreference('WebAppStartupTimeout', 120000);

// eslint-disable-next-line no-undef
App.accessRule('http://*', { type: 'navigation' });
// eslint-disable-next-line no-undef
App.accessRule('https://*', { type: 'navigation' });
// eslint-disable-next-line no-undef
App.accessRule('http://*', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://*', { type: 'network' });

// eslint-disable-next-line no-undef
App.accessRule('http://www.google-analytics.com', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://www.google-analytics.com', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://cdn.onesignal.com', { type: 'network' });

// eslint-disable-next-line no-undef
App.accessRule('https://*.twitter.com', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://*.twitter.com', { type: 'navigation' });
// eslint-disable-next-line no-undef
App.accessRule('https://*.instagram.com', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://*.instagram.com', { type: 'navigation' });
// eslint-disable-next-line no-undef
App.accessRule('https://*.facebook.com', { type: 'network' });
// eslint-disable-next-line no-undef
App.accessRule('https://*.facebook.com', { type: 'navigation' });

// https://www.resource-generator.com/
// https://docs.meteor.com/api/mobile-config.html#App-icons
// TODO mobile
// eslint-disable-next-line no-undef
// App.icons({
//   app_store: 'private/assets/icon.png', // 1024x1024
//   iphone_2x: 'private/assets/res/icons/ios/icon-60@2x.png', // 120x120
//   iphone_3x: 'private/assets/res/icons/ios/icon-60@3x.png', // 180x180
//   ipad_2x: 'private/assets/res/icons/ios/icon-76@2x.png', // 152x152
//   ipad_pro: 'private/assets/res/icons/ios/icon-83.5@2x.png', // 167x167
//   ios_settings_2x: 'private/assets/res/icons/ios/icon-small@2x.png', // 58x58
//   ios_settings_3x: 'private/assets/res/icons/ios/icon-small@3x.png', // 87x87
//   ios_spotlight_2x: 'private/assets/res/icons/ios/icon-small-40@2x.png', // 80x80
//   ios_spotlight_3x: 'private/assets/res/icons/ios/icon-small-40@2x.png', // (120x120) // iPhone 6 Plus, 6s Plus, 7 Plus, 8 Plus, X
//   ios_notification_2x: 'private/assets/res/icons/ios/icon-small-40.png', // 40x40
//   ios_notification_3x: 'private/assets/res/icons/ios/icon-60.png', // 60x60
//   ipad: 'private/assets/res/icons/ios/icon-76.png', // 76x76
//   ios_settings: 'private/assets/res/icons/ios/icon-small.png', // 29x29
//   ios_spotlight: 'private/assets/res/icons/ios/icon-small-40.png', // 40x40
//   ios_notification: 'private/assets/res/icons/ios/icon-small-40.png', // 20x20
//   iphone_legacy: 'private/assets/res/icons/ios/icon.png', // 57x57
//   iphone_legacy_2x: 'private/assets/res/icons/ios/icon@2x.png', // 114x114
//   ipad_spotlight_legacy: 'private/assets/res/icons/ios/icon-small-50.png', // 50x50
//   ipad_spotlight_legacy_2x: 'private/assets/res/icons/ios/icon-small-50@2x.png', // 100x100
//   ipad_app_legacy: 'private/assets/res/icons/ios/icon-72.png', // 72x72
//   ipad_app_legacy_2x: 'private/assets/res/icons/ios/icon-72@2x.png', // 144x144
//   android_mdpi: 'private/assets/res/icons/android/drawable-mdpi-icon.png', // 48x48
//   android_hdpi: 'private/assets/res/icons/android/drawable-hdpi-icon.png', // 72x72
//   android_xhdpi: 'private/assets/res/icons/android/drawable-xhdpi-icon.png', // 96x96
//   android_xxhdpi: 'private/assets/res/icons/android/drawable-xxhdpi-icon.png', // 144x144
//   android_xxxhdpi: 'private/assets/res/icons/android/drawable-xxxhdpi-icon.png', // 192x192
// });

// https://docs.meteor.com/api/mobile-config.html#App-launchScreens
// TODO mobile
// eslint-disable-next-line no-undef
// App.launchScreens({
//   android_mdpi_portrait:
//     'private/assets/res/screens/android/drawable-port-mdpi-screen.png',
//   android_mdpi_landscape:
//     'private/assets/res/screens/android/drawable-land-mdpi-screen.png',
//   android_hdpi_portrait:
//     'private/assets/res/screens/android/drawable-port-hdpi-screen.png',
//   android_hdpi_landscape:
//     'private/assets/res/screens/android/drawable-land-hdpi-screen.png',
//   android_xhdpi_portrait:
//     'private/assets/res/screens/android/drawable-port-xhdpi-screen.png',
//   android_xhdpi_landscape:
//     'private/assets/res/screens/android/drawable-land-xhdpi-screen.png',
//   android_xxhdpi_portrait:
//     'private/assets/res/screens/android/drawable-port-xxhdpi-screen.png',
//   android_xxhdpi_landscape:
//     'private/assets/res/screens/android/drawable-land-xxhdpi-screen.png',
//   android_xxxhdpi_portrait:
//     'private/assets/res/screens/android/drawable-port-xxxhdpi-screen.png',
//   android_xxxhdpi_landscape:
//     'private/assets/res/screens/android/drawable-land-xxxhdpi-screen.png',
// });

// eslint-disable-next-line no-undef
App.appendToConfig(`
  <platform name="ios">
    <splash src="../../../private/assets/res/screens/ios/Default@2x~universal~anyany.png" />
  </platform>
  <platform name="android">
    <preference name="android-targetSdkVersion" value="29" />
  </platform>
  <platform name="android">
    <preference name="android-minSdkVersion" value="20" />
  </platform>
  <universal-links>
    <host name="${urlUniversalLink}" scheme="${schemeUniversalLink}" />
  </universal-links>
  <edit-config file="app/src/main/AndroidManifest.xml" mode="merge" target="/manifest/application" xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:usesCleartextTraffic="true"></application>
  </edit-config>
`);
