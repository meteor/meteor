Package.describe({
  summary: "contains a cordova plugin",
  version: "1.1.0"
});

Package.on_use(function(api) {
  Cordova.depends({
    'org.apache.cordova.camera': '0.3.0'
  });
});
