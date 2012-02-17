Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Package.on_use(function (api) {
  api.use(['stream', 'uuid']);
  api.use(['json', 'underscore'], 'server');
  api.use(['json', 'underscore', 'deps', 'minimongo', 'logging'], 'client');

  // this should move to a new package, called something like 'base'?
  api.add_files('client_base.js', 'client');
  api.add_files('server_base.js', 'server');

  api.add_files('livedata_client.js', 'client');
  api.add_files([
    'livedata_server.js',
    'mongo_driver.js'
  ], 'server');

  api.add_files('local_collection_driver.js', ['client', 'server']);
  api.add_files('remote_collection_driver.js', 'server');
  api.add_files('collection.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('livedata', ['client', 'server']);
  api.use('tinytest');
  api.add_files('livedata_tests.js', 'client');
});
