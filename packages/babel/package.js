Package.describe({
  summary: "Parser/transpiler for ECMAScript 6+ syntax",
  version: '4.7.13' // tracks the npm version below
});

Npm.depends({
  'babel-core': '4.7.13'
});

Package.onUse(function (api) {
  api.addFiles('babel.js', 'server');

  api.export('Babel', 'server');
});

Package.onTest(function (api) {
  api.use('tinytest', 'server');
  api.use('babel', 'server');

  api.addFiles('babel-tests.js', 'server');
});
