Package.describe({
  version: '1.0.10',
  summary: 'SHA256 implementation',
  git: 'https://github.com/meteor/meteor'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.export('SHA256');
  api.mainModule('sha256-server.js', 'server');
  api.mainModule('sha256-client.js', 'client');
});
