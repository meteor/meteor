Package.describe({
  summary: "Tiny testing framework",
  version: '1.0.6'
});

Package.onUse(function (api) {
  api.use([
    'ejson',
    'underscore',
    'random',
    'ddp',
    'mongo',
    'check'
  ]);

  api.addFiles('tinytest.js');
  api.addFiles('model.js');
  api.addFiles('tinytest_client.js', 'client');
  api.addFiles('tinytest_server.js', 'server');

  api.export('Tinytest');
});
