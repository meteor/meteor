Package.describe({
  summary: "Deprecated package (now empty)",
  version: "1.0.10",
  git: 'https://github.com/meteor/meteor/tree/master/packages/preserve-inputs'
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'server');
});
