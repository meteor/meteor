Package.describe({
  summary: 'Common code for browser-policy packages',
  version: '1.0.12',
});

Package.onUse(api => {
  api.use(['ecmascript', 'webapp'], 'server');
  api.export('BrowserPolicy', 'server');
  api.mainModule('browser-policy-common.js', 'server');
});
