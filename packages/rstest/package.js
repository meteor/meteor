Package.describe({
  name: 'rstest',
  version: '0.1.0-beta.0',
  summary: 'Test-only Rstest capability and Meteor runtime executor',
  testOnly: true,
  documentation: 'README.md',
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'meteor', 'rspack']);
  api.use('isobuild:test-runner-plugin@1.0.0');
  api.use('webapp', 'server');
  api.mainModule('server/main.js', 'server');
  api.mainModule('client/main.js', 'client');
  api.addAssets('runtime/api.d.ts', 'server');
});

Package.registerTestRunnerPlugin({
  name: 'rstestTestRunnerProvider',
  sources: [
    'tooling/lib/constants.js',
    'tooling/lib/dependencies.js',
    'tooling/provider/errors.js',
    'tooling/provider/inventory.js',
    'tooling/provider/process.js',
    'tooling/provider/browser.js',
    'tooling/provider/external.js',
    'runtime/coordinator.js',
    'runtime/reporter.js',
    'tooling/provider/workers.js',
    'tooling/provider/provider.js',
    'tooling/plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});
