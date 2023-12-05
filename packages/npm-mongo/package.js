// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: '4.17.0-beta2140.7',
  documentation: null
});

Npm.depends({
  mongodb: "4.17.0",
  saslprep: "1.0.3"
});

Package.onUse(function (api) {
  api.addFiles("wrapper.js", "server");
  api.export([
    "NpmModuleMongodb",
    "NpmModuleMongodbVersion",
  ], "server");
  api.addAssets('index.d.ts', 'server');
});
