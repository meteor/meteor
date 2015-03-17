Package.describe({
  summary: 'Expressive, dynamic, robust CSS',
  version: "1.0.7"
});

Package.registerBuildPlugin({
  name: "compileStylus",
  use: [],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: { stylus: "0.46.3", nib: "1.0.2" }
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
