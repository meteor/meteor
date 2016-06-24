Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons",
  version: "1.1.2_1"
});

Package.registerBuildPlugin({
  name: "compileCoffeescript",
  use: ['caching-compiler', 'ecmascript'],
  sources: ['plugin/compile-coffeescript.js'],
  npmDependencies: {
    "coffee-script": "1.10.0",
    "source-map": "0.5.6"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler');

  // Because the CoffeeScript plugin now calls
  // BabelCompiler.prototype.processOneFileForTarget for any raw
  // JavaScript enclosed by backticks, it must provide the same runtime
  // environment that the 'ecmascript' package provides. The following
  // api.imply calls should match those in ../ecmascript/package.js,
  // except that coffeescript does not api.imply('modules').
  api.imply('ecmascript-runtime');
  api.imply('babel-runtime');
  api.imply('promise');
});

Package.onTest(function (api) {
  api.use(['coffeescript', 'tinytest']);
  api.use(['coffeescript-test-helper', 'ecmascript'], ['client', 'server']); // Need ecmascript to compile tests/es2015_module.js
  api.addFiles('tests/bare_test_setup.coffee', ['client'], {bare: true});
  api.addFiles('tests/bare_tests.js', ['client']);
  api.addFiles([
    'tests/coffeescript_test_setup.js',
    'tests/coffeescript_tests.coffee',
    'tests/coffeescript_strict_tests.coffee',
    'tests/es2015_module.js',
    'tests/litcoffeescript_tests.litcoffee',
    'tests/litcoffeescript_tests.coffee.md',
    'tests/coffeescript_tests.js'
  ], ['client', 'server']);
});
