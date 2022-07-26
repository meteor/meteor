Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  version: '7.9.1'
});

Npm.depends({
  '@meteorjs/babel': '7.16.0-beta.4',
  'json5': '2.1.1'
});

Package.onUse(function (api) {
  api.versionsFrom("2.7.4-beta.2")
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
