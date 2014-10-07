App.info({
  name: 'Todos',
  description: 'A simple todo list app built in Meteor.',
  author: 'Percolate Studio Team',
  email: 'us@percolatestudio.com',
  website: 'http://percolatestudio.com'
});

App.icons({
  // iOS
  'iphone': 'resources/icons/icon-60.png',
  'iphone-2x': 'resources/icons/icon-60@2x.png',
  'ipad': 'resources/icons/icon-72.png',
  'ipad-2x': 'resources/icons/icon-72@2x.png',

  // Android - XXX these are the same as iOS for now
  'android_ldpi': 'resources/icons/icon-60.png',
  'android_mdpi': 'resources/icons/icon-60.png',
  'android_hdpi': 'resources/icons/icon-72.png',
  'android_xhdpi': 'resources/icons/icon-72@2x.png'
});

App.launchScreens({
  // iOS
  'iphone': 'resources/splash/Default~iphone.png',
  'iphone_2x': 'resources/splash/Default@2x~iphone.png',
  'iphone5': 'resources/splash/Default-568h@2x~iphone.png',
  'ipad_portrait': 'resources/splash/Default-Portrait~ipad.png',
  'ipad_portrait_2x': 'resources/splash/Default-Portrait@2x~ipad.png',
  'ipad_landscape': 'resources/splash/Default-Landscape~ipad.png',
  'ipad_landscape_2x': 'resources/splash/Default-Landscape@2x~ipad.png'
});

App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
