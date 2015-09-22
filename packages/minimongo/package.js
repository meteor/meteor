Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  version: '1.0.9'
});

Package.onUse(function (api) {
  api.export('LocalCollection');
  api.export('Minimongo');
  api.export('MinimongoTest', { testOnly: true });
  api.use(['underscore', 'ejson', 'id-map', 'ordered-dict', 'tracker',
           'mongo-id', 'random', 'diff-sequence']);
  // This package is used for geo-location queries such as $near
  api.use('geojson-utils');
  // This package is used to get diff results on arrays and objects
  api.use('diff-sequence');

  api.addFiles([
    'minimongo.js',
    'wrap_transform.js',
    'helpers.js',
    'selector.js',
    'sort.js',
    'projection.js',
    'modify.js',
    'diff.js',
    'id_map.js',
    'observe.js',
    'objectid.js'
  ]);

  // Functionality used only by oplog tailing on the server side
  api.addFiles([
    'selector_projection.js',
    'selector_modifier.js',
    'sorter_projection.js'
  ], 'server');
});

Package.onTest(function (api) {
  api.use('minimongo', ['client', 'server']);
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'tracker', 'reactive-var', 'mongo-id']);
  api.addFiles('minimongo_tests.js', 'client');
  api.addFiles('wrap_transform_tests.js');
  api.addFiles('minimongo_server_tests.js', 'server');
});
