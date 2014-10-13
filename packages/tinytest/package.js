Package.describe({
  summary: "Tiny testing framework",
  version: '1.0.3'
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('random', ['client', 'server']);

  api.export('Tinytest');

  api.add_files('tinytest.js', ['client', 'server']);

  api.use('ddp', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.add_files('model.js', ['client', 'server']);

  api.add_files('tinytest_client.js', 'client');
  api.add_files('tinytest_server.js', 'server');

  api.use('check');
});
