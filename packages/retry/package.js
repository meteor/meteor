Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '2.0.0-alpha300.9',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('random');
  api.mainModule('retry.js');
  api.export('Retry');
});
