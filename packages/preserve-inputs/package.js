Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.11-beta.9"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
