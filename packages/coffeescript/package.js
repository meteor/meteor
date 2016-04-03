Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons",
  version: "1.0.18-beta.2"
});

Package.registerBuildPlugin({
  name: "compileCoffeescript",
  use: ['caching-compiler', 'ecmascript'],
  sources: ['plugin/compile-coffeescript.js'],
  npmDependencies: {
    "coffee-script": "1.10.0",
    "source-map": "0.5.3"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('ecmascript');
});

Package.onTest(function (api) {
  api.use(['coffeescript', 'tinytest']);
  api.use(['coffeescript-test-helper', 'ecmascript'], ['client', 'server']);
  api.addFiles('bare_test_setup.coffee', ['client'], {bare: true});
  api.addFiles('bare_tests.js', ['client']);
  api.addFiles([
    'coffeescript_test_setup.js',
    'tests/coffeescript_tests.coffee',
    'tests/coffeescript_strict_tests.coffee',
    'tests/es2015_module.js',
    'tests/litcoffeescript_tests.litcoffee',
    'tests/litcoffeescript_tests.coffee.md',
    'coffeescript_tests.js'
  ], ['client', 'server']);
});
