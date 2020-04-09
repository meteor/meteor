Package.describe({
  summary: "Update the client when new client code is available.",
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.use([
    'webapp',
    'check',
    'inter-process-messaging',
    'ddp'
  ], 'server');

  api.use([
    'tracker',
    'reload',
  ], 'client');

  api.use([
    'ecmascript',
  ], ['client', 'server']);

  api.mainModule('autoupdate-polling-server.js', 'server');
  api.mainModule('autoupdate-polling-client.js', 'client');
  api.mainModule('autoupdate-polling-cordova.js', 'web.cordova');

  api.export('AutoupdatePolling');
});
