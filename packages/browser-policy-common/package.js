Package.describe({
  summary: "Common code for browser-policy packages",
  internal: true
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.add_files('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
});
