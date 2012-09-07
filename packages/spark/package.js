Package.describe({
  summary: "Toolkit for live-updating HTML interfaces",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'uuid', 'domutils', 'liverange', 'universal-events'],
          'client');

  // XXX Depends on jquery because we need a selector engine to resolve
  // event maps. What would be nice is, if you've included jquery or
  // zepto, use one of those; if not, ship our own copy of sizzle (but,
  // you still want the event object normalization that jquery provides?)
  api.use('jquery');

  api.add_files(['spark.js', 'patch.js', 'convenience.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['spark', 'test-helpers'], 'client');

  api.add_files('test_form_responder.js', 'server');

  api.add_files([
    'spark_tests.js',
    'patch_tests.js'
  ], 'client');
});
