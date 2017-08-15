Package.describe({
  name: 'coffeescript',
  summary: 'Javascript dialect with fewer braces and semicolons',
  // This package version used to track the version of the NPM `coffeescript`
  // module, but now the Meteor package `coffeescript-compiler` tracks that
  // version; so in order for this to appear newer than the previous package
  // version 1.12.6_1, we jump to 10+.
  version: '1.13.0'
});

Package.registerBuildPlugin({
  name: 'compile-coffeescript',
  use: ['caching-compiler', 'coffeescript-compiler', 'ecmascript'],
  sources: ['compile-coffeescript.js'],
  npmDependencies: {
    'coffeescript': '1.12.7',
    'source-map': '0.5.6'
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Because the CoffeeScript plugin now calls
  // BabelCompiler.prototype.processOneFileForTarget for any ES2015+
  // JavaScript or JavaScript enclosed by backticks, it must provide the
  // same runtime environment that the 'ecmascript' package provides.
  // The following api.imply calls should match those in ../ecmascript/package.js,
  // except that coffeescript does not api.imply('modules').
  api.imply('ecmascript-runtime', 'server');
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
    'tests/coffeescript_module.coffee',
    'tests/es2015_module.js',
    'tests/litcoffeescript_tests.litcoffee',
    'tests/litcoffeescript_tests.coffee.md',
    'tests/coffeescript_tests.js'
  ], ['client', 'server']);
});
