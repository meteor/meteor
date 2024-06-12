Package.describe({
  summary: 'Update the client when new client code is available',
  version: '2.0.0-rc300.4',
});

Package.onUse(function(api) {
  api.use(['webapp', 'check', 'inter-process-messaging'], 'server');

  api.use(['tracker', 'retry'], 'client');

  api.use('reload', 'client', { weak: true });

  api.use(['ecmascript', 'ddp'], ['client', 'server']);

  api.mainModule('autoupdate_server.js', 'server');
  api.mainModule('autoupdate_client.js', 'client');
  api.mainModule('autoupdate_cordova.js', 'web.cordova');

  api.export('Autoupdate');
});
