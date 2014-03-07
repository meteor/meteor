Package.describe({
  summary: "Common code for browser-policy packages",
  version: "1.0.0",
  internal: true
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.add_files('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
});
