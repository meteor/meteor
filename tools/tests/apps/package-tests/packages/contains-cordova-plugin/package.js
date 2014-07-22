Package.describe({
  summary: "contains a cordova plugin",
  version: "1.1.0"
});

Package.on_use(function(api) {
  Cordova.depends({
    'org.apache.cordova.camera': '0.3.0',
    'com.phonegap.plugins.facebookconnect':
      'https://github.com/Wizcorp/phonegap-facebook-plugin/tarball/bd0092a01b6171a2239aee9d77d3d3fd2f90129d'
  });
});
