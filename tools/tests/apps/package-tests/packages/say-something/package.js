Package.describe({
  version: "1.0.0",
  summary: "print to console"
});

Package.on_use(function (api) {
  api.add_files('foo.js');
});
