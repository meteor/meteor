Package.describe({
  summary: "Retry logic with exponential backoff",
  version: '1.1.1-alpha300.18'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('random');
  api.mainModule('retry.js');
  api.export('Retry');
});
