Package.describe({
  summary: "Tiny testing framework",
  version: '1.2.1'
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'ejson',
    'underscore',
    'random',
    'ddp',
    'check'
  ]);
  if (!process.env.DISABLE_FIBERS) {
    api.use('mongo');
  } else {
    api.use('mongo-async');
  }

  api.mainModule('tinytest_client.js', 'client');
  api.mainModule('tinytest_server.js', 'server');

  api.export('Tinytest');
});
