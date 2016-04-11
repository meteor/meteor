Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.9-rc.2"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
