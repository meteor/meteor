Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.6-rc.0"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
