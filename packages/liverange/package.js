Package.describe({
  summary: "Mark, track, and update an arbitrary region in the DOM",
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
