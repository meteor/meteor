Package.describe({
  summary: "Good defaults for the mobile status bar",
  version: "1.0.3"
});

Package.onUse(function(api) {
  api.addFiles('mobile-status-bar.js', 'web.cordova');
});

Cordova.depends({
  'org.apache.cordova.statusbar': '0.1.10'
});
