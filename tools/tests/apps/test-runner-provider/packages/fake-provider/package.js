Package.describe({
  name: 'fake-provider',
  version: '1.0.0',
  summary: 'Self-test activation and host fixture for generic test runners',
  testOnly: true,
});

Package.onUse(function (api) {
  api.versionsFrom('3.0');
  api.use([
    'ecmascript',
    'meteor',
    'webapp',
    'fake-provider-compiler',
  ], 'server');
  api.use('isobuild:test-runner-plugin@1.0.0');
  api.mainModule('server.js', 'server');
});

Package.registerTestRunnerPlugin({
  name: 'fakeTestRunnerProvider',
  sources: ['tooling/provider.js'],
  use: ['ecmascript'],
});
