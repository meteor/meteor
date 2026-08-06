Package.describe({
  name: 'fake-provider-tooling',
  version: '1.0.0',
  summary: 'Self-test fixture for generic test-runner provider discovery',
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerBuildPlugin({
  name: 'fakeTestRunnerProvider',
  sources: ['provider.js'],
  use: ['ecmascript'],
});
