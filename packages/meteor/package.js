// All other packages automatically depend on this one

Package.describe({
  summary: "Core Meteor environment",
  internal: true
});

Package._transitional_registerBuildPlugin({
  name: "basicFileTypes",
  sources: ['plugin/basic-file-types.js']
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);

  api.export('Meteor');

  // Workaround for https://github.com/joyent/node/issues/6506
  api.add_files('node-issue-6506-workaround.js', 'server');

  api.add_files('client_environment.js', 'client');
  api.add_files('server_environment.js', 'server');
  api.add_files('helpers.js', ['client', 'server']);
  api.add_files('setimmediate.js', ['client', 'server']);
  api.add_files('timers.js', ['client', 'server']);
  api.add_files('errors.js', ['client', 'server']);
  api.add_files('fiber_helpers.js', 'server');
  api.add_files('fiber_stubs_client.js', 'client');
  api.add_files('startup_client.js', ['client']);
  api.add_files('startup_server.js', ['server']);
  api.add_files('debug.js', ['client', 'server']);

  // dynamic variables, bindEnvironment
  // XXX move into a separate package?
  api.add_files('dynamics_browser.js', 'client');
  api.add_files('dynamics_nodejs.js', 'server');

  // note server before common. usually it is the other way around, but
  // in this case server must load first.
  api.add_files('url_server.js', 'server');
  api.add_files('url_common.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use(['underscore', 'tinytest', 'test-helpers']);

  api.add_files('client_environment_test.js', 'client');
  api.add_files('server_environment_test.js', 'server');

  api.add_files('helpers_test.js', ['client', 'server']);
  api.add_files('dynamics_test.js', ['client', 'server']);

  api.add_files('fiber_helpers_test.js', ['server']);
  api.add_files('wrapasync_test.js', ['server']);

  api.add_files('url_tests.js', ['client', 'server']);

  api.add_files('timers_tests.js', ['client', 'server']);

  api.add_files('debug_test.js', 'client');

  api.add_files('bare_test_setup.js', 'client', {bare: true});
  api.add_files('bare_tests.js', 'client');
});
