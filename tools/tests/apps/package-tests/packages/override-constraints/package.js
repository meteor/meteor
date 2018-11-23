Package.describe({
  name: "override-constraints",
  version: "1.5.3",
  summary: "Test package for @x.y.z! style package version constraints",
  documentation: null,
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.mainModule("override-constraints.js");
});
