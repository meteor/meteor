Package.describe({
  summary: "Meteor's reliable message delivery module",
  internal: true
});

Package.depend({
  client: 'underscore',
  server: 'underscore'
});

Package.source({
  client: 'stream_client.js',
  server: 'stream_server.js'
});
