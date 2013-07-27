Package.describe({
  summary: "Session variable",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'reactive-dict', 'ejson'], 'client');

  // Session can work with or without reload, but if reload is present
  // it should load first so we can detect it at startup and populate
  // the session.
  api.use('reload', 'client', {weak: true});

  api.export('Session', 'client');
  api.add_files('session.js', 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('session', 'client');
  api.use('deps');
  api.use('mongo-livedata');
  api.add_files('session_tests.js', 'client');
});
