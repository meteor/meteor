Package.describe({
  summary: "contains a cordova plugin",
  version: "1.1.0"
});

Package.onUse(function(api) {
  Cordova.depends({
    'cordova-plugin-camera': null,
    'com.phonegap.plugins.facebookconnect':
      'https://github.com/Wizcorp/phonegap-facebook-plugin/tarball/3d52b1eb8a55ebcf8ad10c75d99deedeca0c0fdd'
  });
});
