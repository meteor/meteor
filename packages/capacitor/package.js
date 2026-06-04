Package.describe({
  summary: "Integrate Capacitor as a mobile target on top of Meteor's web.cordova build",
  version: '0.1.0-alpha.0',
});

Package.registerBuildPlugin({
  name: 'capacitor',
  sources: [
    'lib/constants.js',
    'lib/dependencies.js',
    'lib/build-context.js',
    'lib/transforms.js',
    'lib/readiness.js',
    'lib/processes.js',
    'lib/command.js',
    'capacitor_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core', 'boilerplate-generator'],
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use(['tools-core', 'webapp']);

  api.mainModule('capacitor_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'capacitor', 'tools-core']);
  api.addFiles(['capacitor_tests.js'], 'server');
});
