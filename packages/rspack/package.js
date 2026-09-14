Package.describe({
  summary: "Integrate rspack into the Meteor lifecycle to run the bundler independently",
  version: '1.3.0',
});

Package.registerBuildPlugin({
  name: 'rspack',
  sources: [
    'lib/constants.js',
    'lib/file-extensions.js',
    'lib/dependencies.js',
    'lib/build-context.js',
    'lib/processes.js',
    'lib/config.js',
    'rspack_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});

Npm.devDepends({
  // Maintained, drop-in replacement for the unmaintained http-proxy that
  // http-proxy-middleware relied on, which used the deprecated util._extend and
  // legacy url.parse APIs (meteor/meteor#13491).
  'http-proxy-3': '1.22.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use(['tools-core', 'webapp']);

  api.mainModule('rspack_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'rspack']);
  api.mainModule('rspack_tests.js', 'server');
});
