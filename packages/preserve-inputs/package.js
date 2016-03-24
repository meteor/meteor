Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.7-rc.11"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
