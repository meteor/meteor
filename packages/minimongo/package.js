Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  version: '1.4.5'
});

Package.onUse(api => {
  api.export('LocalCollection');
  api.export('Minimongo');

  api.export('MinimongoTest', { testOnly: true });
  api.export('MinimongoError', { testOnly: true });

  api.use([
    // This package is used to get diff results on arrays and objects
    'diff-sequence',
    'ecmascript',
    'ejson',
    // This package is used for geo-location queries such as $near
    'geojson-utils',
    'id-map',
    'mongo-id',
    'ordered-dict',
    'random',
    'tracker'
  ]);

  api.mainModule('minimongo_client.js', 'client');
  api.mainModule('minimongo_server.js', 'server');
});

Package.onTest(api => {
  api.use('minimongo');
  api.use([
    'ecmascript',
    'ejson',
    'mongo-id',
    'ordered-dict',
    'random',
    'reactive-var',
    'test-helpers',
    'tinytest',
    'tracker'
  ]);

  api.addFiles('minimongo_tests.js');
  api.addFiles('minimongo_tests_client.js', 'client');
  api.addFiles('minimongo_tests_server.js', 'server');
});
