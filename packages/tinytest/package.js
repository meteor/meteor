Package.describe({
  summary: "Tiny testing framework",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('random', ['client', 'server']);

  api.exportSymbol('Tinytest');

  api.add_files('tinytest.js', ['client', 'server']);

  api.use('livedata', ['client', 'server']);
  api.use('mongo-livedata', ['client', 'server']);
  api.add_files('model.js', ['client', 'server']);

  api.add_files('tinytest_client.js', 'client');
  api.use('startup', 'server');
  api.add_files('tinytest_server.js', 'server');

  api.use('check');
});
