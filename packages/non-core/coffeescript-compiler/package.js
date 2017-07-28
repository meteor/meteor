Package.describe({
  name: 'coffeescript-compiler',
  summary: 'Compiler for CoffeeScript code, supporting the coffeescript package',
  version: '1.12.7_1' // Tracks version of NPM `coffeescript` module, with _1, _2 etc.
});

Npm.depends({
  'coffeescript': '1.12.7',
  'source-map': '0.5.6'
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.use('ecmascript');

  api.addFiles(['coffeescript-compiler.js'], 'server');

  api.export('CoffeeScriptCompiler', 'server');
});

// See `coffeescript` package for tests.
