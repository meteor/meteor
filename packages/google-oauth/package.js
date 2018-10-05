Package.describe({
  summary: "Google OAuth flow",
  version: "1.2.6",
});

const cordovaPluginGooglePlusURL =
  // This revision is from the "update-entitlements-plist-files" branch.
  // This logic can be reverted when/if this PR is merged:
  // https://github.com/EddyVerbruggen/cordova-plugin-googleplus/pull/366
  "https://github.com/meteor/cordova-plugin-googleplus.git#3095abe327e710ab04059ae9d3521bd4037c5a37";

Cordova.depends({
  "cordova-plugin-googleplus": cordovaPluginGooglePlusURL
});

Package.onUse(api => {
  api.use("ecmascript");
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('service-configuration');
  api.use('random', 'client');

  api.addFiles('google_server.js', 'server');
  api.addFiles('google_client.js', 'client');
  api.addFiles('google_sign-in.js', 'web.cordova');

  api.mainModule('namespace.js');

  api.export('Google');
});
