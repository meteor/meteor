Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api) {
  api.export('LocalCollection');
  api.use(['underscore', 'json', 'ejson', 'ordered-dict', 'deps',
           'random', 'ordered-dict']);
  // If you really want geolocation queries to work, add this package
  api.imply('geojson-utils');
  api.add_files([
    'minimongo.js',
    'selector.js',
    'modify.js',
    'diff.js',
    'objectid.js'
  ]);
});

Package.on_test(function (api) {
  api.use('minimongo', 'client');
  api.use('geojson-utils', 'client');
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'deps']);
  api.add_files('minimongo_tests.js', 'client');
});
