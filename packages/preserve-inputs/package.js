Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.11-beta.13"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
