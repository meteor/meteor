Package.describe({
  name: 'coffeescript',
  summary: 'Javascript dialect with fewer braces and semicolons',
  // This package version should track the version of the `coffeescript-compiler`
  // package, because people will likely only have this one added to their apps;
  // so bumping the version of this package will be how they get newer versions
  // of `coffeescript-compiler`. If you change this, make sure to also update
  // ../coffeescript-compiler/package.js to match.
  version: '1.12.7_3'
});

Package.registerBuildPlugin({
  name: 'compile-coffeescript',
  use: ['caching-compiler@1.1.9', 'ecmascript@0.8.3', 'coffeescript-compiler@=1.12.7_3'],
  sources: ['compile-coffeescript.js']
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Because the CoffeeScript plugin now calls
  // BabelCompiler.prototype.processOneFileForTarget for any ES2015+
  // JavaScript or JavaScript enclosed by backticks, it must provide the
  // same runtime environment that the 'ecmascript' package provides.
  // The following api.imply calls should match those in ../../ecmascript/package.js,
  // except that coffeescript does not api.imply('modules').
  api.imply('ecmascript-runtime-server@0.4.1', 'server');
  api.imply('babel-runtime@1.0.1');
  api.imply('promise@0.9.0');
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
