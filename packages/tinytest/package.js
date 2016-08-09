Package.describe({
  summary: "Tiny testing framework",
  version: '1.0.11',
  git: 'https://github.com/meteor/meteor/tree/master/packages/tinytest'
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
