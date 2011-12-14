Package.describe({
  summary: "Skybreak's reliable message delivery module",
  internal: true
});

Package.require('underscore');

Package.client_file('stream_client.js');
Package.server_file('stream_server.js');
