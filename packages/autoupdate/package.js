Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.0.5-cordova5'
});

Cordova.depends({
  'org.apache.cordova.file': '1.3.0',
  'org.apache.cordova.file-transfer': '0.4.4'
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['deps', 'retry', 'random'], 'client');
  api.use(['livedata', 'mongo-livedata', 'underscore'], ['client', 'server']);
  api.use('deps', 'client');
  api.use('reload', 'client', {weak: true});
  api.use('http', 'client.cordova');

  api.export('Autoupdate');
  api.add_files('autoupdate_server.js', 'server');
  api.add_files('autoupdate_client.js', 'client.browser');
  api.add_files('autoupdate_cordova.js', 'client.cordova');
});
