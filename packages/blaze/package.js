Package.describe({
  summary: "Meteor UI Components framework",
  version: '1.0.3'
});

Package.on_use(function (api) {
  api.export(['Blaze']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('tracker');
  api.use('underscore'); // only the subset in microscore.js
  api.use('htmljs');
  api.use('observe-sequence');

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
    'reactivevar.js',
    'view.js',
    'builtins.js',
    'lookup.js'
  ]);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('blaze');
  api.use(['test-helpers', 'underscore'], 'client');

  // ...
});
