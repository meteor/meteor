Package.describe({
  summary: "Common code for browser-policy packages",
  version: "1.0.5-beta.13"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.addFiles('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
});
