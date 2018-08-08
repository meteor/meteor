Package.describe({
  summary: "Meteor's DDP stream server based on uWS",
  version: '0.5.1',
  documentation: 'README.md'
});

Npm.depends({
  uws: '10.148.0'
});

Package.onUse(function (api) {
  api.use(['ecmascript'], 'server');
  api.use(['webapp', 'routepolicy'], 'server');
  // Update StreamServers global variable
  api.use(['stream-server'], 'server');
  api.imply(['stream-server'], 'server');

  api.export('StreamServers', 'server');
  api.export('StreamServerUWS', 'server');

  api.addFiles('stream_server_uws.js', 'server');
});
