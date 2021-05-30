Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.11",
  deprecated: true
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
