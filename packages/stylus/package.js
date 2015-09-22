Package.describe({
  summary: 'Expressive, dynamic, robust CSS',
  version: "2.511.0_1"
});

Package.registerBuildPlugin({
  name: 'compileStylusBatch',
  use: ['ecmascript', 'caching-compiler'],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: {
    stylus: "https://github.com/meteor/stylus/tarball/d4352c9cb4056faf238e6bd9f9f2172472b67c5b", // fork of 0.51.1
    nib: "1.1.0"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'stylus', 'test-helpers', 'templating']);
  api.addFiles([
    'stylus_tests.html',
    'stylus_tests.styl',
    'stylus_tests.import.styl',
    'stylus_tests.js'
  ],'client');
});
