Package.describe({
  summary: 'Expressive, dynamic, robust CSS.'
});

Package._transitional_registerBuildPlugin({
  name: "compileStylus",
  use: [],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: { stylus: "0.30.1", nib: "0.8.2" }
});

Package.on_test(function (api) {
  api.use(['tinytest', 'stylus', 'test-helpers'])
  api.add_files(['stylus_tests.styl', 'stylus_tests.js'], 'client');
});
