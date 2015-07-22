Package.describe({
  name: 'ecmascript',
  version: '0.1.3',
  summary: 'Compiler plugin that supports ES2015+ in all .js files',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: 'compile-ecmascript',
  use: ['babel-compiler@5.8.3_1'],
  sources: ['plugin.js']
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.imply('babel-runtime@0.1.2');
  api.imply('promise@0.4.1');
});

Package.onTest(function (api) {
  api.use(["tinytest", "underscore"]);
  api.use(["ecmascript", "babel-compiler"]);
  api.addFiles("runtime-tests.js");
  api.addFiles("transpilation-tests.js", "server");
});
