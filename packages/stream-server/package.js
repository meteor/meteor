Package.describe({
  summary: "Meteor's DDP stream server based on SockJS",
  version: '2.2.0',
  documentation: 'README.md'
});

Npm.depends({
  "permessage-deflate": "0.1.6",
  sockjs: "0.3.19"
});

Package.onUse(function (api) {
  api.use(['webapp', 'routepolicy'], 'server');

  api.addFiles('once.js', 'server');
  api.addFiles('stream_server.js', 'server');

  api.export('StreamServers', 'server');
});
