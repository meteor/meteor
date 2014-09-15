Package.describe({
  summary: "Internal package that implements the url escaping logic for assets.",
  version: "1.0.0"
});

Package.onUse(function(api) {
  api.addFiles('assets-escaping.js');
  api.export('AssetsEscaping');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('assets-escaping');
});
