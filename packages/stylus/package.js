Package.describe({
  summary: 'Expressive, dynamic, robust CSS',
  version: "2.0.0_511"
});

Package.registerBuildPlugin({
  name: 'compileStylusBatch',
  use: ['compiler-plugin'],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: {
    stylus: "https://github.com/meteor/stylus/tarball/ea5f990bb25aabbc2caf358b4922f176f626e085", // fork of 0.51.1
    nib: "1.1.0" }
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
