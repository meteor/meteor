Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Package.on_use(function (api) {
  api.use(['stream', 'uuid']);
  api.use(['json', 'underscore'], 'server');
  api.use(['json', 'underscore', 'deps', 'minimongo', 'logging'], 'client');

  api.add_files('livedata_client.js', 'client');
  api.add_files([
    'livedata_server.js',
    'mongo_driver.js'
  ], 'server');

});
