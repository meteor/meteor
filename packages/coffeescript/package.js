Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons",
  version: "1.0.10"
});

Package.registerBuildPlugin({
  name: "compileCoffeescript",
  use: ['caching-compiler', 'ecmascript'],
  sources: ['plugin/compile-coffeescript.js'],
  npmDependencies: {
    "coffee-script": "1.9.2",
    "source-map": "0.4.2"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
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
