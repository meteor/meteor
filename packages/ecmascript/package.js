Package.describe({
  name: 'ecmascript',
  version: '0.1.5',
  summary: 'Compiler plugin that supports ES2015+ in all .js files',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: 'compile-ecmascript',
  use: ['babel-compiler'],
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler');

  api.imply('babel-runtime');
  api.imply('ecmascript-runtime');
  api.imply('promise');

  api.addFiles("ecmascript.js", "server");
  api.export("ECMAScript");
});

Package.onTest(function (api) {
  api.use(["tinytest", "underscore"]);
  api.use(["es5-shim", "ecmascript", "babel-compiler"]);
  api.addFiles("runtime-tests.js");
  api.addFiles("transpilation-tests.js", "server");

  api.addFiles("bare-test-file.js", "client", { bare: true });
  api.addFiles("bare-test.js", "client");
});
