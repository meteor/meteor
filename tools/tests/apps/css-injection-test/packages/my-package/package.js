Package.describe({
  summary: "test local package reloading"
});

Package.on_use(function (api) {
  api.add_files('foo.css', 'client');
});