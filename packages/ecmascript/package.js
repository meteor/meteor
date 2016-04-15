Package.describe({
  name: 'ecmascript',
  version: '0.4.2',
  summary: 'Support for ES2015+ in all .js files',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.imply('modules');
  api.imply('ecmascript-compiler');
  api.imply('ecmascript-runtime');
  api.imply('babel-runtime');
  api.imply('promise');

  api.use('ecmascript-compiler', 'server');
  api.export("ECMAScript", "server");
});

Package.onTest(function (api) {
  api.use(["tinytest", "underscore"]);
  api.use(["es5-shim", "ecmascript"]);
  api.addFiles("runtime-tests.js");
});
