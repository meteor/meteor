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
    bundle.add_resource({
      type: "css",
      path: serve_path,
      source_file: source_path,
      where: where
    });
  }
);

Package.on_use(function (api, where) {
  api.add_files('client_environment.js', 'client');
  api.add_files('server_environment.js', 'server');
});
