Package.describe({
  summary: "Common code for browser-policy packages",
  version: '1.0.13-rc300.2',
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.addFiles('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
  api.addAssets('browser-policy-common.d.ts', 'server');
});
