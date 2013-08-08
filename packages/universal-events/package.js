Package.describe({
  summary: "Listen to events globally, and normalize them",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'domutils'], 'client');
  api.export('UniversalEventListener', 'client');
  api.add_files(['listener.js',
                 'events-w3c.js',
                 'events-ie.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['universal-events', 'test-helpers', 'underscore'], 'client');
  api.use('domutils');
  api.use('spark');

  api.add_files([
    'event_tests.js'
  ], 'client');
});
