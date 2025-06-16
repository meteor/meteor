Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  version: '7.12.0',
});

Npm.depends({
  '@meteorjs/babel': '7.20.1',
  'json5': '2.2.3',
  'semver': '7.6.3',
  "@meteorjs/swc-core": "1.1.3",
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
  api.export('SwcCompiler', 'server');
});
