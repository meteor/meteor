Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api) {
  api.export('LocalCollection');
  api.export('Minimongo');
  api.export('MinimongoTest', { testOnly: true });
  api.use(['underscore', 'json', 'ejson', 'id-map', 'ordered-dict', 'deps',
           'random', 'ordered-dict']);
  // This package is used for geo-location queries such as $near
  api.use('geojson-utils');
  api.add_files([
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
  api.add_files([
    'selector_projection.js',
    'selector_modifier.js',
    'sorter_projection.js'
  ], 'server');
});

Package.on_test(function (api) {
  api.use('minimongo', ['client', 'server']);
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'deps']);
  api.add_files('minimongo_tests.js', 'client');
  api.add_files('wrap_transform_tests.js');
  api.add_files('minimongo_server_tests.js', 'server');
});
