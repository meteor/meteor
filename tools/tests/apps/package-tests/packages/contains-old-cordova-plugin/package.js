Package.describe({
  summary: "contains a cordova plugin",
  version: "1.1.0"
});

Package.onUse(function(api) {
  Cordova.depends({
    'cordova-plugin-camera': '1.0.0'
  });
});
