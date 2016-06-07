Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.10-rc.4"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
