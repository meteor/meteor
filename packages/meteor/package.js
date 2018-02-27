// All other packages automatically depend on this one

Package.describe({
  summary: "Core Meteor environment",
  version: '1.8.4'
});

Package.registerBuildPlugin({
  name: "basicFileTypes",
  sources: ['plugin/basic-file-types.js']
});

Npm.depends({
  "meteor-deque": "2.1.0"
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  api.export('Meteor');

  api.addFiles('global.js', ['client', 'server']);
  api.export('global');

  api.addFiles('client_environment.js', 'client');
  api.addFiles('server_environment.js', 'server');
  // Defined by client_environment.js and server_environment.js.
  api.export("meteorEnv");

  api.addFiles('cordova_environment.js', 'web.cordova');
  api.addFiles('define-package.js', ['client', 'server']);
  api.addFiles('helpers.js', ['client', 'server']);
  api.addFiles('setimmediate.js', ['client', 'server']);
  api.addFiles('timers.js', ['client', 'server']);
  api.addFiles('errors.js', ['client', 'server']);
  api.addFiles('fiber_helpers.js', 'server');
  api.addFiles('fiber_stubs_client.js', 'client');
  api.addFiles('startup_client.js', ['client']);
  api.addFiles('startup_server.js', ['server']);
  api.addFiles('debug.js', ['client', 'server']);
  api.addFiles('string_utils.js', ['client', 'server']);
  api.addFiles('test_environment.js', ['client', 'server']);
  
  // dynamic variables, bindEnvironment
  // XXX move into a separate package?
  api.addFiles('dynamics_browser.js', 'client');
  api.addFiles('dynamics_nodejs.js', 'server');

  // note server before common. usually it is the other way around, but
  // in this case server must load first.
  api.addFiles('url_server.js', 'server');
  api.addFiles('url_common.js', ['client', 'server']);

  // People expect process.exit() to not swallow console output.
  // On Windows, it sometimes does, so we fix it for all apps and packages
  api.addFiles('flush-buffers-on-exit-in-windows.js', 'server');
});

Package.onTest(function (api) {
  api.use(['underscore', 'tinytest', 'test-helpers']);

  api.addFiles('browser_environment_test.js', 'web.browser');
  api.addFiles('client_environment_test.js', 'client');
  api.addFiles('cordova_environment_test.js', 'web.cordova');
  api.addFiles('server_environment_test.js', 'server');

  api.addFiles('helpers_test.js', ['client', 'server']);
  api.addFiles('dynamics_test.js', ['client', 'server']);

  api.addFiles('fiber_helpers_test.js', ['server']);
  api.addFiles('wrapasync_test.js', ['server']);

  api.addFiles('url_tests.js', ['client', 'server']);

  api.addFiles('timers_tests.js', ['client', 'server']);

  api.addFiles('debug_test.js', 'client');

  api.addFiles('bare_test_setup.js', 'client', {bare: true});
  api.addFiles('bare_tests.js', 'client');
});
