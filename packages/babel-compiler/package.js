Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  // Tracks the npm version below.  Use wrap numbers to increment
  // without incrementing the npm version.
  version: '5.8.3'
});

Npm.depends({
  'meteor-babel': '0.4.6'
});

Package.onUse(function (api) {
  api.addFiles('babel.js', 'server');
  api.use('check');
  api.export('Babel', 'server');
});
