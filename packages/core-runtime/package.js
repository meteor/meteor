Package.describe({
  summary: "Core runtime to load packages and the app",
  version: '1.0.0'
});

Package.onUse(function (api) {
  // This package is linked differently since it sets up the runtime
  // the linker expects to exist.
  // Currently this package can not use any exports or ordered dependencies

  api.addFiles('package-registry.js');
});
