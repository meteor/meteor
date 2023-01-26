Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  version: '7.10.3-beta2110.0'
});

Npm.depends({
  '@meteorjs/babel': '7.18.0-beta.6',
  'json5': '2.1.1'
});

Package.onUse(function (api) {
  api.use('ecmascript-runtime', 'server');
  api.use('modern-browsers');

  api.addFiles([
    'babel.js',
    'babel-compiler.js',
    'versions.js',
  ], 'server');

  api.export('Babel', 'server');
  api.export('BabelCompiler', 'server');
});
