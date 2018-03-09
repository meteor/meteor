Package.describe({
  summary: 'Restrict which websites can frame your app',
  version: '1.1.1',
});

Package.onUse(api => {
  api.use(['ecmascript', 'browser-policy-common'], 'server');
  api.imply(['browser-policy-common'], 'server');
  api.mainModule('browser-policy-framing.js', 'server');
});
