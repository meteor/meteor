Package.describe({
  summary: "Tiny testing framework",
  version: '1.2.2'
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'ejson',
    'underscore',
    'random',
    'ddp',
    'mongo',
    'check'
  ]);
  api.imply('dynamic-import');
  api.mainModule('tinytest_client.js', 'client');
  api.mainModule('tinytest_server.js', 'server');

  api.export('Tinytest');
});
