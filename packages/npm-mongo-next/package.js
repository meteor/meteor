// Opt-in preview of the next major version of the MongoDB Node.js driver.
// When an app adds this package, npm-mongo exports this driver instead of its
// own bundled one. See README.md for what changes in the driver.

Package.describe({
  summary: "Wrapper around the mongo npm package (next major version, opt-in)",
  version: "7.9.1",
  documentation: "README.md",
});

Npm.depends({
  mongodb: "7.9.1",
});

Package.onUse(function (api) {
  api.addFiles("wrapper.js", "server");
  api.export(["NpmModuleMongodb", "NpmModuleMongodbVersion"], "server");
  api.addAssets("index.d.ts", "server");
  api.addAssets("package-types.json", "server");
});
