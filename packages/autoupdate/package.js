Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.2.1'
});

Cordova.depends({
  'org.apache.cordova.file': '1.3.3',
  'org.apache.cordova.file-transfer': '0.5.0'
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.use(['tracker', 'retry'], 'client');
  api.use(['ddp', 'mongo', 'underscore'], ['client', 'server']);
  api.use('tracker', 'client');
  api.use('reload', 'client', {weak: true});
  api.use(['http', 'random'], 'web.cordova');

  api.export('Autoupdate');
  api.addFiles('autoupdate_server.js', 'server');
  api.addFiles('autoupdate_client.js', 'web.browser');
  api.addFiles('autoupdate_cordova.js', 'web.cordova');
});
