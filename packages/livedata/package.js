Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Package.on_use(function (api) {
  api.use('stream');
  api.use(['json', 'underscore'], 'server');
  api.use(['json', 'underscore', 'deps', 'minimongo'], 'client');

  api.add_files('livedata_client.js', 'client');
  api.add_files([
    'uuid.js',
    'livedata_server.js',
    'mongo_driver.js'
  ], 'server');

});
