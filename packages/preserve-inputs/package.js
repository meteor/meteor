Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.7-rc.5"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
