Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.6-beta.9"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
