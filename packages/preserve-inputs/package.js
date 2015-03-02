Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.3-eachin.43"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
