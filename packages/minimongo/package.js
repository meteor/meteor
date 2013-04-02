Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  // It would be sort of nice if minimongo didn't depend on
  // underscore, so we could ship it separately.
  api.use(['underscore', 'json', 'ejson', 'ordered-dict', 'deps',
           'random', 'ordered-dict'], where);
  api.add_files([
    'minimongo.js',
    'selector.js',
    'modify.js',
    'diff.js',
    'objectid.js'
  ], where);
});

Package.on_test(function (api) {
  api.use('minimongo', 'client');
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'deps']);
  api.add_files('minimongo_tests.js', 'client');
});
