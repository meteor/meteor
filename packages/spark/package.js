Package.describe({
  summary: "Toolkit for live-updating HTML interfaces",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'random', 'domutils', 'liverange', 'universal-events',
           'ordered-dict'],
          'client');

  api.add_files(['controller.js',
                 'spark.js', 'patch.js', 'convenience.js',
                 'utils.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['spark', 'test-helpers'], 'client');

  api.add_files('test_form_responder.js', 'server');

  api.add_files([
    'controller_tests.js',
    'spark_tests.js',
    'patch_tests.js'
  ], 'client');
});
