// This sets up the basic environment that any package will want.

Package.describe({
  summary: "Base package that all other packages automatically depend on.",
  internal: true
});

Package.register_extension(
  "js", function (bundle, source_path, serve_path, env) {
    bundle.add_resource({
      type: "js",
      path: serve_path,
      source_file: source_path,
      environments: env
    });
  }
);

Package.register_extension(
  "css", function (bundle, source_path, serve_path, env) {
    bundle.add_resource({
      type: "css",
      path: serve_path,
      source_file: source_path,
      environments: env
    });
  }
);
