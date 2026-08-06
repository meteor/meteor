Package.describe({
  name: 'fake-provider-two-tooling',
  version: '1.0.0',
  summary: 'Second generic test-runner provider conflict fixture',
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerBuildPlugin({
  name: 'fakeTestRunnerProviderTwo',
  sources: ['provider.js'],
  use: ['ecmascript'],
});
