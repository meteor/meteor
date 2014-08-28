Package.describe({
  summary: "Meteor UI Components framework",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.export(['UI', 'Handlebars']);
  api.use('jquery'); // should be a weak dep, by having multiple "DOM backends"
  // XXX StyleHandler uses $.trim since Safari 4 doesn't support
  // `String.trim`. We should just replace this with our own `trim` if
  // we want to make jquery a weak dep.
  api.use('tracker');
  api.use('random');
  api.use('ejson');
  api.use('underscore'); // slight
  api.use('ordered-dict');
  api.use('minimongo');  // for idStringify
  api.use('observe-sequence');

  api.use('htmljs');
  api.imply('htmljs');

  api.use('blaze');
  api.imply('blaze');

  api.add_files(['ui.js']);
  api.add_files(['handlebars_backcompat.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('jquery'); // strong dependency, for testing jQuery backend
  api.use('ui');
  api.use(['test-helpers', 'underscore'], 'client');
  api.use('blaze-tools'); // for `HTML.toJS`

  api.use('html-tools');

  api.add_files([
    'render_tests.js'
  ], 'client');
});
