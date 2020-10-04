Package.describe({
  summary: "Used internally by WebApp. Knows how to hash programs from manifests.",
  version: "1.0.9"
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.use('underscore', 'server');
  api.addFiles('webapp-hashing.js', 'server');
  api.export('WebAppHashing');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('webapp-hashing');
});
