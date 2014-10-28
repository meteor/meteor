Package.describe({
  summary: "Meteor Reactive Templating library",
  version: '2.0.3'
});

Package.on_use(function (api) {
  api.export(['Blaze', 'UI', 'Handlebars']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('tracker');
  api.use('underscore'); // only the subset in microscore.js
  api.use('htmljs');
  api.imply('htmljs');
  api.use('observe-sequence');
  api.use('reactive-var');

  api.add_files([
    'preamble.js'
  ]);

  // client-only files
  api.add_files([
    'dombackend.js',
    'domrange.js',
    'events.js',
    'attrs.js',
    'materializer.js'
  ], 'client');

  // client and server
  api.add_files([
    'exceptions.js',
    'view.js',
    'builtins.js',
    'lookup.js',
    'template.js',
    'backcompat.js'
  ]);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('blaze');
  api.use('test-helpers');
  api.use('underscore');
  api.use('blaze-tools'); // for BlazeTools.toJS
  api.use('html-tools');
  api.use('reactive-var');

  api.add_files('view_tests.js');
  api.add_files('render_tests.js', 'client');
});
