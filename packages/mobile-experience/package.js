Package.describe({
  name: 'mobile-experience',
  version: '1.1.2-rc300.5',
  summary: 'Packages for a great mobile user experience',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply([
    // A nicer appearance for the status bar in PhoneGap/Cordova apps
    "mobile-status-bar"
  ], "web.cordova");

  api.imply([
    // Show a nice splash image while your PhoneGap/Cordova app's UI is loading.
    // Doesn't do anything without Cordova, but we include it everywhere so you
    // don't need a ton of if statements around your LaunchScreen calls.
    "launch-screen"
  ]);
});
