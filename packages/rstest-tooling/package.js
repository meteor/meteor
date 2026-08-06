Package.describe({
  name: 'rstest-tooling',
  version: '0.1.0-beta.0',
  summary: 'Build-time npm dependency bootstrap for Meteor Rstest',
  documentation: null,
});

Package.onUse(function (api) {
  api.use('isobuild:test-runner-plugin@1.0.0');
});

Package.registerBuildPlugin({
  name: 'rstest',
  sources: [
    'lib/constants.js',
    'lib/dependencies.js',
    'rstest_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});
