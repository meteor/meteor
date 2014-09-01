Package.describe({
  summary: "Update the client when new client code is available",
  version: '1.0.6-rc1'
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use(['tracker', 'retry'], 'client');
  api.use(['ddp', 'mongo', 'underscore'], ['client', 'server']);
  api.use('tracker', 'client');
  api.use('reload', 'client', {weak: true});

  api.export('Autoupdate');
  api.add_files('autoupdate_server.js', 'server');
  api.add_files('autoupdate_client.js', 'client');
});
