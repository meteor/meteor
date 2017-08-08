Package.describe({
  name: "tilde-dependent",
  version: "0.1.0",
  summary: "Package for testing inter-package @~ constraints",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("tilde-constraints");
  api.mainModule("tilde-dependent.js");
});
