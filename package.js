Package.describe({
  summary: "Meteor Reactive Templating library",
  version: '2.1.3'
});

Package.onUse(function (api) {
  api.export(['Blaze', 'UI', 'Handlebars']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('tracker');
  api.use('check');
  api.use('underscore'); // only the subset in microscore.js
  api.use('htmljs');
  api.imply('htmljs');
  api.use('observe-sequence');
  api.use('reactive-var');

  api.addFiles([
    'preamble.js'
  ]);

  // client-only files
  api.addFiles([
    'dombackend.js',
    'domrange.js',
    'events.js',
    'attrs.js',
    'materializer.js'
  ], 'client');

  // client and server
  api.addFiles([
    'exceptions.js',
    'view.js',
    'builtins.js',
    'lookup.js',
    'template.js',
    'backcompat.js'
  ]);
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('blaze');
  api.use('test-helpers');
  api.use('underscore');
  api.use('blaze-tools'); // for BlazeTools.toJS
  api.use('html-tools');
  api.use('reactive-var');
  api.use('tracker');
  api.use('templating');

  api.addFiles('view_tests.js');
  api.addFiles('render_tests.js', 'client');
});
