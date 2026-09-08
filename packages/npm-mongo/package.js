// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: "6.16.3",
  documentation: null,
});

Npm.depends({
  mongodb: "6.16.0"
});

Package.onUse(function (api) {
  api.addFiles("wrapper.js", "server");
  api.export(["NpmModuleMongodb", "NpmModuleMongodbVersion"], "server");
  api.export("NpmMongoTest", "server", { testOnly: true });
  api.addAssets("index.d.ts", "server");
  api.addAssets("package-types.json", "server");
});

Package.onTest(function (api) {
  api.use(["npm-mongo", "tinytest"], "server");
  api.addFiles("wrapper-tests.js", "server");
});
