Package.describe({
  summary: "Tiny testing framework",
  version: '2.0.0-beta300.4',
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
