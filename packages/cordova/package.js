Package.describe({
  summary: "Build mobile applications with Apache Cordova",
  version: "5.1.1",
});

Package.onUse(function (api) {
  api.use("ecmascript");

  api.addFiles([
    "cordova.js"
  ], "server");

  api.export("Cordova", "server");
});

var npmDependencies = {
  // We use our own branch because cordova-lib does not respect the silent option
  // https://github.com/meteor/cordova-lib/tree/respect-silent/cordova-lib
  // Can't download the tarball from GitHub because the package.json is in a subdirectory
  "cordova-lib": "https://s3.amazonaws.com/android-bundle/cordova-lib-0000000000000000000000000000000000000000.tar.gz"
};

if (process.platform === 'darwin') {
  npmDependencies["ios-sim"] = "4.1.1";
}

Npm.depends(npmDependencies);
