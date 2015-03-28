Package.describe({
  summary: "test local package reloading"
});

Package.onUse(function (api) {
  api.addFiles('foo.css', 'client');
});