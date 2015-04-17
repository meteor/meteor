Package.describe({
  version: "1.0.0",
  summary: "contains a empty cordova plugin"
});

Package.onUse(function(api) {
  Cordova.depends({
    'com.cordova.empty': 'file://../../../../cordova-local-plugin'
  });
});
