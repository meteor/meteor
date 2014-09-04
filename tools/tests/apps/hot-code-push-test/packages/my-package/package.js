Package.describe({
  summary: "test local package reloading"
});

Package.on_use(function (api) {
  api.export('packageVar');
  api.add_files('foo.js', 'client');
});