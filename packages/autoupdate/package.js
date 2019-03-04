Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.5.1'
});

Package.onUse(function (api) {
  api.use([
    'webapp',
    'check',
    'inter-process-messaging',
  ], 'server');

  api.use([
    'tracker',
    'retry'
  ], 'client');

  api.use([
    'ecmascript',
    'ddp',
    'mongo',
  ], ['client', 'server']);

  api.mainModule('autoupdate_server.js', 'server');
  api.mainModule('autoupdate_client.js', 'client');
  api.mainModule('autoupdate_cordova.js', 'web.cordova');

  api.export('Autoupdate');
});
