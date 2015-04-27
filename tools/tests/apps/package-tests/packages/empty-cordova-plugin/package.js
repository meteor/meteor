Package.describe({
  version: "1.0.0",
  summary: "contains an empty cordova plugin"
});

Package.onUse(function(api) {
  Cordova.depends({
    // In the test "meteor reinstalls only local cordova plugins on consecutive
    // builds/runs" (test in file cordova-plugin.js) the "plugin"
    // directory from this package is copied one level up from the meteor project.
    // Cordova local plugins must have an absolute or relative path to
    // meteor project, so in this case the plugin will be one level up from it.
    'com.cordova.empty': 'file://../cordova-local-plugin'
  });
});
