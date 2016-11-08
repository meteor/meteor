Package.describe({
  name: 'ecmascript',
  version: '0.6.0',
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
  api.use('babel-compiler@6.13.0');

  // The following api.imply calls should match those in
  // ../coffeescript/package.js.
  api.imply('modules@0.7.7');
  api.imply('ecmascript-runtime@0.3.15');
  api.imply('babel-runtime@1.0.0');
  api.imply('promise@0.8.8');

  api.addFiles("ecmascript.js", "server");
  api.export("ECMAScript", "server");
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
