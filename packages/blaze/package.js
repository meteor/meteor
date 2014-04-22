Package.describe({
  summary: "Meteor UI Components framework",
  internal: true
});

Package.on_use(function (api) {
  api.export(['Blaze']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('deps');
  //api.use('observe-sequence');

  api.add_files([
    'preamble.js',
    'html.js',
    'microscore.js',
    'sequence.js',
    'var.js',
    'domrange.js',
    'render.js',
    'component.js',
    'materialize.js',
    'attrs.js',
    'blaze.js'
  ], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('blaze');
  api.use(['test-helpers', 'underscore'], 'client');

  // ...
});
