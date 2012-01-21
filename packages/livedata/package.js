Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  internal: true
});

Package.depend({
  client: ['json', 'underscore', 'deps', 'stream', 'minimongo'],
  server: ['json', 'underscore', 'stream']
});

Package.source({
  client: 'livedata_client.js',
  server: [
    'uuid.js',
    'livedata_server.js',
    'mongo_driver.js'
  ]
});
