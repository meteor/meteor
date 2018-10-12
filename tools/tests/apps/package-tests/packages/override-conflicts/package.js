Package.describe({
  name: "override-conflicts",
  version: "1.0.1",
  summary: "Test package for @x.y.z! style package version constraints",
  documentation: null,
});

Package.onUse(function(api) {
  api.use("ecmascript");
  // PLACEHOLDER
  api.mainModule("override-conflicts.js");
});
