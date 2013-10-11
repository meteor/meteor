Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api) {
  api.export('LocalCollection');
  api.export('MinimongoTest', { testOnly: true });
  api.use(['underscore', 'json', 'ejson', 'ordered-dict', 'deps',
           'random', 'ordered-dict']);
  // This package is used for geo-location queries such as $near
  api.use('geojson-utils');
  api.add_files([
    'minimongo.js',
    'selector.js',
    'modify.js',
    'diff.js',
    'objectid.js'
  ]);
});

Package.on_test(function (api) {
  api.use('geojson-utils', 'client');
  api.use('minimongo', 'client');
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'deps']);
  api.add_files('minimongo_tests.js', 'client');
});
