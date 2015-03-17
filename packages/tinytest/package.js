Package.describe({
  summary: "Tiny testing framework",
  version: '1.0.5'
});

Package.onUse(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('random', ['client', 'server']);

  api.export('Tinytest');

  api.addFiles('tinytest.js', ['client', 'server']);

  api.use('ddp', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.addFiles('model.js', ['client', 'server']);

  api.addFiles('tinytest_client.js', 'client');
  api.addFiles('tinytest_server.js', 'server');

  api.use('check');
});
