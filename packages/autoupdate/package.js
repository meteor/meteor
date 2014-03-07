Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['deps', 'retry'], 'client');
  api.use(['livedata', 'mongo-livedata'], ['client', 'server']);
  api.use('deps', 'client');
  api.use('reload', 'client', {weak: true});

  api.export('Autoupdate');
  api.add_files('autoupdate_server.js', 'server');
  api.add_files('autoupdate_client.js', 'client');
});
