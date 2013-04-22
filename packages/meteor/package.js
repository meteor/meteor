// All other packages automatically depend on this one

Package.describe({
  summary: "Core Meteor environment",
  internal: true
});

Package.register_extension(
  "js", function (bundle, source_path, serve_path, where) {
    bundle.add_resource({
      type: "js",
      path: serve_path,
      source_file: source_path,
      where: where
    });
  }
);

Package.register_extension(
  "css", function (bundle, source_path, serve_path, where) {
    if (where === "client") {
      bundle.add_resource({
        type: "css",
        path: serve_path,
        source_file: source_path,
        where: where
      });
    }

    // XXX in the future, might be better to emit some kind of a
    // warning if a stylesheet is included on the server, rather than
    // silently ignoring it
  }
);

Package.on_use(function (api, where) {
  api.use('underscore', ['client', 'server']);

  api.add_files('client_environment.js', 'client');
  api.add_files('server_environment.js', 'server');
  api.add_files('helpers.js', ['client', 'server']);
  api.add_files('timers.js', ['client', 'server']);
  api.add_files('errors.js', ['client', 'server']);
  api.add_files('fiber_helpers.js', 'server');
  api.add_files('fiber_stubs_client.js', 'client');

  // dynamic variables, bindEnvironment
  // XXX move into a separate package?
  api.use('underscore', ['client', 'server']);
  api.add_files('dynamics_browser.js', 'client');
  api.add_files('dynamics_nodejs.js', 'server');

  // note server before common. usually it is the other way around, but
  // in this case server must load first.
  api.add_files('url_server.js', 'server');
  api.add_files('url_common.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use(['underscore', 'tinytest']);

  api.add_files('client_environment_test.js', 'client');
  api.add_files('server_environment_test.js', 'server');

  api.add_files('helpers_test.js', ['client', 'server']);
  api.add_files('dynamics_test.js', ['client', 'server']);

  api.add_files('fiber_helpers_test.js', ['server']);

  api.add_files('url_tests.js', ['client', 'server']);
});
