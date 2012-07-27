Package.describe({
  summary: "Meteor's machinery for making arbitrary templates reactive",
  internal: true
});

Package.on_use(function (api) {
  api.use('livedata');
  api.use(['underscore', 'session', 'liverange'], 'client');

  // XXX Depends on jquery because we need a selector engine to resolve
  // event maps. What would be nice is, if you've included jquery or
  // zepto, use one of those; if not, ship our own copy of sizzle (but,
  // you still want the event object normalization that jquery provides?)
  api.use('jquery');

  api.add_files(['domutils.js'], 'client');
  api.add_files(['liveevents_w3c.js', 'liveevents_now3c.js'], 'client');
  api.add_files(['liveevents.js'], 'client');
  api.add_files(['livedocument.js'], 'client');
  api.add_files(['liveui.js', 'innerhtml.js', 'patcher.js'],
                'client');
});

Package.on_test(function (api) {
  api.use(['tinytest', 'templating', 'htmljs']);
  api.use(['liveui', 'test-helpers'], 'client');

  api.add_files('form_responder.js', 'server');

  api.add_files([
    'livedocument_tests.js',
    'liveui_tests.js',
    'liveui_tests.html',
    'patcher_tests.js',
    'liveevents_tests.js'
  ], 'client');
});
