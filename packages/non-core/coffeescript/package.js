Package.describe({
  name: 'coffeescript',
  summary: 'JavaScript dialect with fewer braces and semicolons',
  // This package version should track the version of the `coffeescript-compiler`
  // package, because people will likely only have this one added to their apps;
  // so bumping the version of this package will be how they get newer versions
  // of `coffeescript-compiler`. If you change this, make sure to also update
  // ../coffeescript-compiler/package.js to match.
  version: '2.7.1-rc300.0'
});

Package.registerBuildPlugin({
  name: 'compile-coffeescript',
  use: ['caching-compiler@2.0.0-rc300.2', 'ecmascript@0.16.9-rc300.2', 'coffeescript-compiler@2.4.1'],
  sources: ['compile-coffeescript.js'],
  npmDependencies: {
    // A breaking change was introduced in @babel/runtime@7.0.0-beta.56
    // with the removal of the @babel/runtime/helpers/builtin directory.
    // Since the compile-coffeescript plugin is bundled and published with
    // a specific version of babel-compiler and babel-runtime, it also
    // needs to have a reliable version of the @babel/runtime npm package,
    // rather than delegating to the one installed in the application's
    // node_modules directory, so the coffeescript package can work in
    // Meteor 1.7.1 apps as well as 1.7.0.x and earlier.
    '@babel/runtime': '7.6.0'
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Because the CoffeeScript plugin now calls
  // BabelCompiler.prototype.processOneFileForTarget for any ES2015+
  // JavaScript or JavaScript enclosed by backticks, it must provide the
  // same runtime environment that the 'ecmascript' package provides.
  // The following api.imply calls should match those in ../../ecmascript/package.js,
  // except that coffeescript does not api.imply('modules').
  api.imply('ecmascript-runtime@0.8.2-rc300.2');
  api.imply('babel-runtime@1.5.2-rc300.2');
  api.imply('promise@1.0.0-rc300.2');
  api.imply('dynamic-import@0.7.4-rc300.2');
});

Package.onTest(function (api) {
  api.use(['coffeescript', 'tinytest', 'modern-browsers']);
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
  api.addFiles('tests/modern_browsers.coffee', ['server']);
});
