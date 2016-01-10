Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.6-modules.4"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
