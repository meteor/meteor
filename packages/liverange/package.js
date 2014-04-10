Package.describe({
  name: "liverange",
  test: "liverange-test",
  summary: "Mark, track, and update an arbitrary region in the DOM",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
  api.export('LiveRange', 'client');
  api.add_files('liverange.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest']);
  api.use(['liverange', 'test-helpers', 'domutils', 'underscore', 'jquery'],
          'client');

  api.add_files([
    'liverange_test_helpers.js',
    'liverange_tests.js'
  ], 'client');
});
