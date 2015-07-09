Package.describe({
  summary: "Good defaults for the mobile status bar",
  version: "1.0.4-plugins.1"
});

Package.onUse(function(api) {
  api.addFiles('mobile-status-bar.js', 'web.cordova');
});

Cordova.depends({
  'cordova-plugin-statusbar': '1.0.0'
});
