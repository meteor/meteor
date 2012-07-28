Package.describe({
  summary: "Toolkit for live-updating HTML interfaces",
  internal: true
});

Package.on_use(function (api) {
  api.use('livedata');
  api.use(['underscore', 'session', 'domutils'], 'client');

  // XXX Depends on jquery because we need a selector engine to resolve
  // event maps. What would be nice is, if you've included jquery or
  // zepto, use one of those; if not, ship our own copy of sizzle (but,
  // you still want the event object normalization that jquery provides?)
  api.use('jquery');

  api.add_files('spark.js', 'client');
/*
  api.add_files(['liveevents_w3c.js', 'liveevents_now3c.js'], 'client');
  api.add_files(['liveevents.js'], 'client');
  api.add_files(['livedocument.js'], 'client');
  api.add_files(['liverange.js', 'liveui.js', 'innerhtml.js', 'patcher.js'],
                'client');
*/
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['spark', 'test-helpers'], 'client');

  api.add_files([
    'spark_tests.js'
  ], 'client');
});
