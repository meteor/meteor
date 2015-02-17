Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.3-githubble.42"
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
