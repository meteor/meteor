Package.describe({
  summary: "Meteor's client-side datastore",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  // It would be sort of nice if minimongo didn't depend on
  // underscore, so we could ship it separately.
  api.use(['underscore', 'json','minimongo'], where);

  api.add_files([
    'miniredis.js',
    'ministringredis.js',
    'minihashredis.js'
  ], where);
});

Package.on_test(function (api) {
  api.use('miniredis', 'client');
  api.use('tinytest');
  api.add_files('miniredis_tests.js', 'client');
});
