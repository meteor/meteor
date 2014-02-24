Package.describe({
  summary: 'Expressive, dynamic, robust CSS'
});

Package._transitional_registerBuildPlugin({
  name: "compileStylus",
  use: [],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: { stylus: "0.42.2", nib: "1.0.2" }
});

Package.on_test(function (api) {
  api.use(['tinytest', 'stylus', 'test-helpers']);
  api.use('spark');
  api.add_files([
    'stylus_tests.styl',
    'stylus_tests.import.styl',
    'stylus_tests.js'
  ],'client');
});
