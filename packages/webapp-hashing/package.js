Package.describe({
  summary: "Used internally by WebApp. Knows how to hash programs from manifests.",
  version: '1.1.2-beta300.3'
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.addFiles('webapp-hashing.js', 'server');
  api.export('WebAppHashing');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('webapp-hashing');
});
