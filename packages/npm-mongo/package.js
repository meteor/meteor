// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: '4.12.1-rc.2',
  documentation: null
});

Npm.depends({
  mongodb: "4.12.1"
});

Package.onUse(function (api) {
  api.addFiles("wrapper.js", "server");
  api.export([
    "NpmModuleMongodb",
    "NpmModuleMongodbVersion",
  ], "server");
});
