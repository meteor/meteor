Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  // Tracks the npm version below.  Use wrap numbers to increment
  // without incrementing the npm version.  Hmm-- Apparently this
  // isn't possible because you can't publish a non-recommended
  // release with package versions that don't have a pre-release
  // identifier at the end (eg, -dev)
  version: '6.4.0-modules.6'
});

Npm.depends({
  'meteor-babel': '0.6.6'
});

Package.onUse(function (api) {
  api.addFiles([
    'babel.js',
    'babel-compiler.js'
  ], 'server');

  api.use('check@1.0.5');

  api.export('Babel', 'server');
  api.export('BabelCompiler', 'server');
});
