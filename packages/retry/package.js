Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.0.9'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('random');
  api.mainModule('retry.js');
  api.export('Retry');
});
