Package.describe({
  name: 'rstest-tooling',
  version: '0.1.0-beta.0',
  summary: 'Build-time test runner provider for Meteor Rstest',
  documentation: null,
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerBuildPlugin({
  name: 'rstestTestRunnerProvider',
  sources: [
    'lib/constants.js',
    'lib/dependencies.js',
    'provider/errors.js',
    'provider/inventory.js',
    'provider/process.js',
    'provider/browser.js',
    'provider/external.js',
    'provider/provider.js',
    'rstest_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});
