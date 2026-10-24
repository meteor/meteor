Package.describe({
  name: 'fake-provider-two',
  version: '1.0.0',
  summary: 'Second generic test-runner provider activation fixture',
  testOnly: true,
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerTestRunnerPlugin({
  name: 'fakeTestRunnerProviderTwo',
  sources: ['tooling/provider.js'],
  use: ['ecmascript'],
});
