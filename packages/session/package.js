var path = require('path');

Package.describe({
  summary: "Session variable",
  internal: true
});

var _ = require('underscore'); // needed at bundle time

Package.on_use(function (api) {
  api.use(['underscore', 'deps'], 'client');
  // XXX what I really want to do is ensure that if 'reload' is going to
  // be loaded, it should be loaded before 'session'. Session can work
  // with or without reload.
  api.use('reload', 'client');

  api.add_files('session.js', 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('session', 'client');
  api.add_files('session_tests.js', 'client');
});
