Package.describe({
  summary: "contains a cordova plugin",
  version: "1.1.0"
});

Package.onUse(function(api) {
  Cordova.depends({
    'org.apache.cordova.camera': '0.3.0',
    'com.phonegap.plugins.facebookconnect':'https://github.com/Wizcorp/phonegap-facebook-plugin/tarball/a89ce0e0d7c05dd95d2ee02a667bf160d8fd500b'

  });
});
