Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.8-rc.3"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
