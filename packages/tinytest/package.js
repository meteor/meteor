Package.describe({
  summary: "Tiny testing framework",
  version: '1.3.0-rc300.8',
});

Npm.depends({
  "lodash.isequal": "4.5.0"
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'ejson',
    'random',
    'ddp',
    'mongo',
    'check'
  ]);

  api.mainModule('tinytest_client.js', 'client');
  api.mainModule('tinytest_server.js', 'server');

  api.export('Tinytest');
});
