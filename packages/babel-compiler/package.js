Package.describe({
  name: "babel-compiler",
  summary: "Parser/transpiler for ECMAScript 2015+ syntax",
  // Tracks the npm version below.  Use wrap numbers to increment
  // without incrementing the npm version.  Hmm-- Apparently this
  // isn't possible because you can't publish a non-recommended
  // release with package versions that don't have a pre-release
  // identifier at the end (eg, -dev)
  version: '6.6.4'
});

Npm.depends({
  'meteor-babel': '0.9.2',
  'json5': '0.5.0',
  'mkdirp': '0.5.1'
});

Package.onUse(function (api) {
  api.use('tmeasday:check-npm-versions@0.3.1', 'server');

  api.addFiles([
    'babel.js',
    'babel-compiler.js'
  ], 'server');

  api.addAssets('babelrc-skel', 'server');

  api.export('Babel', 'server');
  api.export('BabelCompiler', 'server');
});
