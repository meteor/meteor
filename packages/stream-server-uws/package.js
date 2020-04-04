Package.describe({
  summary: "Meteor's DDP stream server based on uWS",
  version: '0.5.1',
  documentation: 'README.md'
});

Npm.depends({
  '@clusterws/cws': '1.5.0'
});

Package.onUse(function (api) {
  api.use(['ecmascript'], 'server');
  api.use(['webapp', 'routepolicy'], 'server');

  // Adding this package will disable SockJS on the client and the server
  api.use('disable-sockjs');

  api.export('StreamServerUWS', 'server');

  api.addFiles('stream_server_uws.js', 'server');
});
