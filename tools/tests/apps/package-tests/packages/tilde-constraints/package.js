Package.describe({
  name: "tilde-constraints",
  version: "0.4.2",
  summary: "Package for testing @~ version constraints",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.mainModule("tilde-constraints.js");
});
