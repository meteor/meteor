Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.1.1-rc300.0',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('random');
  api.mainModule('retry.js');
  api.export('Retry');
});
