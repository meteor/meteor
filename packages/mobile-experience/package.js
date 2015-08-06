Package.describe({
  name: 'mobile-experience',
  version: '1.0.1-plugins.0',
  // Brief, one-line summary of the package.
  summary: 'Packages for a great mobile user experience',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply([
    // Fastclick: remove the 300 ms click event lag in mobile browsers
    "fastclick",

    // A nicer appearance for the status bar in PhoneGap/Cordova apps
    "mobile-status-bar",

    // Show a nice splash image while your PhoneGap/Cordova app's UI is loading
    "launch-screen"
  ], "web.cordova");
});
