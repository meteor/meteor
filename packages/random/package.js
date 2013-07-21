Package.describe({
  summary: "Random number generator and utilities",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.use('underscore');
  api.add_files('random.js', where);
});

Package.on_test(function(api) {
  api.use('random');
  api.use('tinytest');
  api.add_files('random_tests.js', ['client', 'server']);
});
