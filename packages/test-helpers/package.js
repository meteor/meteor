Package.describe({
  summary: "Utility functions for tests"
});

Package.on_use(function (api, where) {
  where = where || ["client", "server"];

  api.add_files('try_all_permutations.js', where);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('test-helpers');
  api.add_files('try_all_permutations_test.js', 'client');
});
