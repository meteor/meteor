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
    stylus: "https://github.com/meteor/stylus/tarball/b05bbcb7c840f3541d78e5f78e81dd28913e3281", // fork of 0.51.1
    nib: "1.1.0",
    "lru-cache": "2.6.4"
  }
});

Package.onTest(function (api) {
  api.use(['tinytest', 'stylus', 'test-helpers', 'templating']);
  api.addFiles([
    'stylus_tests.html',
    'stylus_tests.main.styl',
    'stylus_tests.styl',
    'stylus_tests.js'
  ],'client');
});
