Package.describe({
  summary: "Meteor UI Components framework"
});

Package.on_use(function (api) {
  api.export(['UI', 'Handlebars']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  api.use('deps');
  api.use('random');
  api.use('ejson');
  api.use('underscore'); // slight
  api.use('ordered-dict');
  api.use('minimongo');  // for idStringify
  api.use('observe-sequence');

  api.use('htmljs');
  api.imply('htmljs');

  api.add_files(['exceptions.js', 'base.js']);

  api.add_files(['dombackend.js',
                 'domrange.js'], 'client');

  api.add_files(['attrs.js',
                 'render.js',
                 'builtins.js',
                 'each.js',
                 'fields.js'
                ]);

  api.add_files(['handlebars_backcompat.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('ui');
  api.use(['test-helpers', 'underscore'], 'client');
  api.use('spacebars-compiler'); // for `HTML.toJS`

  api.use('html-tools');

  api.add_files([
    'base_tests.js',
    'domrange_tests.js',
    'render_tests.js',
    'dombackend_tests.js'
  ], 'client');
});
