Package.describe({
  summary: "Allows templates to be defined in .html files",
  version: '1.1.1'
});

// Today, this package is closely intertwined with Handlebars, meaning
// that other templating systems will need to duplicate this logic. In
// the future, perhaps we should have the concept of a template system
// registry and a default templating system, ideally per-package.

Package.registerBuildPlugin({
  name: "compileTemplates",
  // minifiers is a weak dependency of spacebars-compiler; adding it here
  // ensures that the output is minified.  (Having it as a weak dependency means
  // that we don't ship uglify etc with built apps just because
  // boilerplate-generator uses spacebars-compiler.)
  // XXX maybe uglify should be applied by this plugin instead of via magic
  // weak dependency.
  use: ['minifiers', 'spacebars-compiler'],
  sources: [
    'plugin/html_scanner.js',
    'plugin/compile-templates.js'
  ]
});

// This onUse describes the *runtime* implications of using this package.
Package.onUse(function (api) {
  // XXX would like to do the following only when the first html file
  // is encountered

  api.addFiles('templating.js', 'client');
  api.export('Template', 'client');

  api.use('underscore'); // only the subset in packages/blaze/microscore.js

  // html_scanner.js emits client code that calls Meteor.startup and
  // Blaze, so anybody using templating (eg apps) need to implicitly use
  // 'meteor' and 'blaze'.
  api.use('blaze');
  api.imply(['meteor', 'blaze'], 'client');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('htmljs');
  api.use('templating');
  api.use('underscore');
  api.use(['test-helpers', 'session', 'tracker',
           'minimongo'], 'client');
  api.use('spacebars-compiler');
  api.use('minifiers'); // ensure compiler output is beautified

  api.addFiles([
    'plugin/html_scanner.js',
    'scanner_tests.js'
  ], 'server');
});
