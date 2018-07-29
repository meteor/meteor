Package.describe({
  summary: "Meteor's DDP stream server based on uWS",
  version: '0.3.0',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use(['modules'], 'server');

  api.use(['webapp', 'routepolicy'], 'server');
  api.use(['stream-server'], 'server');

  api.imply(['stream-server'], 'server');

  api.export('StreamServers', 'server');

  api.addFiles('stream_server_uws.js', 'server');
});
