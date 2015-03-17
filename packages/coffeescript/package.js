Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons",
  version: "1.0.6"
});

Package.registerBuildPlugin({
  name: "compileCoffeescript",
  use: [],
  sources: [
    'plugin/compile-coffeescript.js'
  ],
  npmDependencies: {"coffee-script": "1.7.1", "source-map": "0.1.32"}
});

Package.onTest(function (api) {
  api.use(['coffeescript', 'tinytest']);
  api.use(['coffeescript-test-helper'], ['client', 'server']);
  api.addFiles('bare_test_setup.coffee', ['client'], {bare: true});
  api.addFiles('bare_tests.js', ['client']);
  api.addFiles([
    'coffeescript_test_setup.js',
    'tests/coffeescript_tests.coffee',
    'tests/coffeescript_strict_tests.coffee',
    'tests/litcoffeescript_tests.litcoffee',
    'tests/litcoffeescript_tests.coffee.md',
    'coffeescript_tests.js'
  ], ['client', 'server']);
});
