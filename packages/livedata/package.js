Package.describe({
  summary: "Skybreak's latency-compensated distributed data framework",
  internal: true
});

Package.require('underscore');
Package.require('session');
Package.require('minimongo');

Package.client_file('livedata_client.js');

Package.server_file('uuid.js');
Package.server_file('livedata_server.js');
Package.server_file('mongo_driver.js');
