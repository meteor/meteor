Package.describe({
  summary: "Meteor UI Components framework",
  internal: true
});

Package.on_use(function (api) {
  api.export(['Blaze']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('deps');
  api.use('underscore'); // only the subset in microscore.js
  api.use('htmljs');
  api.use('jsclass');
  api.use('observe-sequence');

  api.add_files([
    'preamble.js',
    'sequence.js',
    'var.js'
  ]);

  api.add_files([
    'dombackend.js',
    'domrange.js',
    'events.js',
    'attrs.js'
  ], 'client');

  api.add_files([
    'renderpoint.js',
    'component.js'
  ]);

  api.add_files([
    'render.js'
  ], 'client');

  api.add_files([
    'materialize.js',
    'builtins.js'
  ]);

  // new files for blaze-views
  api.add_files([
    'reactivevar.js',
    'materializer.js',
    'stringifiers.js',
    'view.js'
  ]);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('blaze');
  api.use(['test-helpers', 'underscore'], 'client');

  // ...
});
