Package.describe({
  summary: "test local package reloading"
});

Package.onUse(function (api) {
  api.export('packageVar');
  api.addFiles('foo.js', 'client');
});