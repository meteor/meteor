Package.describe({
  name: 'zodern:hot',
  version: '0.1.1',
  summary: 'Adds Hot Module Reloading to Meteor',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: 'hot-core',
  sources: ['plugin.js'],
  use: ['ecmascript'],
  npmDependencies: {
    ws: '7.2.5'
  },
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler');
  api.use('modules');
  api.imply('zodern:modules-runtime-hot');
  api.addFiles('./client.js', 'client');
});

Package.onTest(function (api) {
  api.use(["tinytest", "underscore"]);
  api.use(["es5-shim", "ecmascript", "babel-compiler"]);
  api.addFiles("runtime-tests.js");
  api.addFiles("transpilation-tests.js", "server");

  api.addFiles("bare-test.js");
  api.addFiles("bare-test-file.js", ["client", "server"], {
    bare: true
  });
});
