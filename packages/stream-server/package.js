Package.describe({
  summary: "Meteor's DDP stream server based on SockJS",
  version: '2.3.2',
  documentation: 'README.md'
});

Npm.depends({
  "permessage-deflate": "0.1.7",
  sockjs: "0.3.20"
});

Package.onUse(function (api) {
  api.use(['webapp', 'routepolicy'], 'server');

  api.addFiles('stream_server.js', 'server');

  api.export('StreamServers', 'server');
});
