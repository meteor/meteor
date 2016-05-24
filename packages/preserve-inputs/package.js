Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.10-beta.1"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
