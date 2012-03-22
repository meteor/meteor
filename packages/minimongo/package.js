Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  // It would be sort of nice if minimongo didn't depend on
  // underscore, so we could ship it separately.
  api.use(['underscore', 'json'], where);

  api.add_files([
    'minimongo.js',
    'selector.js',
    'sort.js',
    'uuid.js',
    'modify.js',
    'diff.js'
  ], where);
});

Package.on_test(function (api) {
  api.use('minimongo', 'client');
  api.use('tinytest');
  api.add_files('minimongo_tests.js', 'client');
});
