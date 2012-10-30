var path = require('path');

Package.describe({
  summary: "Session variable",
  internal: true
});

// XXX hack -- need a way to use a package at bundle time
var _ = require(path.join('..', '..', 'packages', 'underscore', 'underscore.js'));

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use(['underscore', 'deps'], where);
  // XXX what I really want to do is ensure that if 'reload' is going to
  // be loaded, it should be loaded before 'session'. Session can work
  // with or without reload.
  if (where === "client" ||
      (where instanceof Array && _.indexOf(where, "client") !== -1)) {
    api.use("reload", "client");
  }

  api.add_files('session.js', where);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('session', 'client');
  api.add_files('session_tests.js', 'client');
});
