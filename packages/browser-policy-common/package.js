Package.describe({
  summary: "Common code for browser-policy packages",
  version: "1.0.6-rc.13"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.addFiles('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
});
