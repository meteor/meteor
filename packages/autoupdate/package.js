Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.1.3'
});

Cordova.depends({
  'org.apache.cordova.file': '1.3.0',
  'org.apache.cordova.file-transfer': '0.4.4'
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['tracker', 'retry'], 'client');
  api.use(['ddp', 'mongo', 'underscore'], ['client', 'server']);
  api.use('tracker', 'client');
  api.use('reload', 'client', {weak: true});
  api.use(['http', 'random'], 'web.cordova');

  api.export('Autoupdate');
  api.add_files('autoupdate_server.js', 'server');
  api.add_files('autoupdate_client.js', 'web.browser');
  api.add_files('autoupdate_cordova.js', 'web.cordova');
});
