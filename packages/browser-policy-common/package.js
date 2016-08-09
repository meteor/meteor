Package.describe({
  summary: "Common code for browser-policy packages",
  version: "1.0.10",
  git: 'https://github.com/meteor/meteor/tree/master/packages/browser-policy-common'
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.addFiles('browser-policy-common.js', 'server');
  api.export('BrowserPolicy', 'server');
});
