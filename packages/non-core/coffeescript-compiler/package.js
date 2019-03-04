// The NPM `coffeescript` module requires Node 6+; but instead of checking for
// a Node runtime version, detect support for async functions, which were
// added in Node 7.6.
try {
  new Function('async () => {}')();
} catch (exception) {
  throw new Error('Your runtime does not support this version of CoffeeScript. Please upgrade to Meteor 1.6 or later, or use a 1.x version of CoffeeScript.');
}


Package.describe({
  name: 'coffeescript-compiler',
  summary: 'Compiler for CoffeeScript code, supporting the coffeescript package',
  // This version of NPM `coffeescript` module, with _1, _2 etc.
  // If you change this, make sure to also update ../coffeescript/package.js to match.
  version: '2.3.2_1'
});

Npm.depends({
  'coffeescript': '2.3.2',
  'source-map': '0.5.7'
});

Package.onUse(function (api) {
  api.use('babel-compiler@6.24.7||7.1.1');
  api.use('ecmascript@0.11.1');

  api.mainModule('coffeescript-compiler.js', 'server');

  api.export('CoffeeScriptCompiler', 'server');
});

// See `coffeescript` package for tests.
