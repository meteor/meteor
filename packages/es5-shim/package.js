Package.describe({
  name: "es5-shim",
  version: "0.1.0-plugins.3",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md"
});

Npm.depends({
  "es5-shim": "4.1.7"
});

Package.onUse(function(api) {
  // Allow the meteor package to register a weak dependency on this
  // package, even though es5-shim implicitly depends on meteor.
  api.use("meteor", { unordered: true });

  // Initialize Date and parseInt with their initial global values.
  api.addFiles("import_globals.js");

  var es5ShimPath = ".npm/package/node_modules/es5-shim/es5-shim.js";

  api.addFiles(es5ShimPath, "client", {
    // Files in the es5-shim package are already wrapped in closures.
    bare: true
  });

  // Only client-side files can be { bare: true }.
  api.addFiles(es5ShimPath, "server");

  // If Date and parseInt were actually reassigned, make the global
  // environment reflect those changes.
  api.addFiles("export_globals.js");

  // Make sure code that depends on this package gets the new values of
  // Date and parseInt.
  api.export("Date");
  api.export("parseInt");
});
