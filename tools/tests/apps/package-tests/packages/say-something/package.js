Package.describe({
  version: "1.0.0",
  summary: "print to console"
});

Package.onUse(function (api) {
  api.addFiles('foo.js');
});
