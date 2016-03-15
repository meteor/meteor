Package.describe({
  summary: "Tiny testing framework",
  version: '1.0.8-rc.1'
});

Package.onUse(function (api) {
  api.use([
    'ejson',
    'underscore-base',
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
