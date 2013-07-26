Package.describe({
  summary: "Allows templates to be defined in .html files",
  internal: true
});

// Today, this package is closely intertwined with Handlebars, meaning
// that other templating systems will need to duplicate this logic. In
// the future, perhaps we should have the concept of a template system
// registry and a default templating system, ideally per-package.

Package._transitional_registerBuildPlugin({
  name: "compileTemplates",
  use: ['underscore', 'handlebars'],
  sources: [
    'plugin/html_scanner.js',
    'plugin/compile-templates.js'
  ]
});

Package.on_use(function (api) {
  // XXX would like to do the following only when the first html file
  // is encountered

  api.use(['underscore', 'spark', 'handlebars'], 'client');

  api.export('Template', 'client');

  // provides the runtime logic to instantiate our templates
  api.add_files('deftemplate.js', 'client');

  // html_scanner.js emits client code that calls Meteor.startup
  api.use('startup', 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('htmljs');
  api.use('templating');
  api.use('handlebars');
  api.use('underscore');
  api.use(['test-helpers', 'domutils', 'session', 'deps',
           'spark', 'minimongo'], 'client');
  api.use('handlebars', 'server');
  api.add_files([
    'templating_tests.js',
    'templating_tests.html'
  ], 'client');
  api.add_files([
    'plugin/html_scanner.js',
    'scanner_tests.js',
  ], 'server');
});
