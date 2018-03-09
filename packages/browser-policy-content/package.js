Package.describe({
  summary: 'Configure content security policies',
  version: '1.1.1',
});

Package.onUse(api => {
  api.use(['ecmascript', 'browser-policy-common', 'webapp'], 'server');
  api.imply(['browser-policy-common'], 'server');
  api.mainModule('browser-policy-content.js', 'server');
});
