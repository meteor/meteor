Package.describe({
  name: 'fake-provider',
  version: '1.0.0',
  summary: 'Self-test activation and host fixture for generic test runners',
});

Package.onUse(function (api) {
  api.versionsFrom('3.0');
  api.use(['ecmascript', 'meteor', 'webapp', 'fake-provider-tooling'], 'server');
  api.mainModule('server.js', 'server');
});
