Package.describe({
  summary: "Integrate rspack into the Meteor lifecycle to run the bundler independently",
  version: '1.1.0-rc341.0',
});

Package.registerBuildPlugin({
  name: 'rspack',
  sources: [
    'lib/constants.js',
    'lib/dependencies.js',
    'lib/build-context.js',
    'lib/processes.js',
    'lib/config.js',
    'rspack_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});

Npm.devDepends({
  'http-proxy-middleware': '3.0.5',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use(['tools-core', 'webapp']);

  api.mainModule('rspack_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'rspack']);
  api.addFiles(['rspack_tests.js']);
});
