Package.describe({
  name: "ie8",
  version: "0.1.0",
  summary: "Shims, shams, and polyfills to improve IE8 support",
  documentation: "README.md"
});

Npm.depends({
  "es5-shim": "4.1.7"
});

Package.onUse(function(api) {
  // Initialize Date and parseInt with their initial global values.
  api.addFiles("import_globals.js", "client");

  api.addFiles([
    // If these paths change, api.addFiles will throw an exception.
    ".npm/package/node_modules/es5-shim/es5-shim.js",
    ".npm/package/node_modules/es5-shim/es5-sham.js",
  ], "client", {
    bare: true // These files are already wrapped in closures.
  });

  // If Date and parseInt were actually reassigned, make the global
  // environment reflect those changes.
  api.addFiles("export_globals.js", "client");

  // Make sure code that depends on this package gets the new values of
  // Date and parseInt.
  api.export("Date", "client");
  api.export("parseInt", "client");
});
