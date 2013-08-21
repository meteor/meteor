Package.describe({
  summary: "Toolkit for live-updating HTML interfaces",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'random', 'domutils', 'liverange', 'universal-events',
           'ordered-dict', 'deps', 'ejson'],
          'client');

  // If we have minimongo available, use its idStringify function.
  api.use('minimongo', 'client', {weak: true});

  api.export('Spark', 'client');
  api.export('SparkTest', 'client', {testOnly: true});

  api.add_files(['spark.js', 'patch.js', 'convenience.js',
                 'utils.js'], 'client');
});

Package.on_test(function (api) {
  api.use('webapp', 'server');
  api.use(['tinytest', 'underscore', 'liverange', 'deps', 'domutils',
           'minimongo', 'random']);
  api.use(['spark', 'test-helpers', 'jquery'], 'client');

  api.add_files('test_form_responder.js', 'server');

  api.add_files([
    'spark_tests.js',
    'patch_tests.js'
  ], 'client');
});
