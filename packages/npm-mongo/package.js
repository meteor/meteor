// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: '1.5.45',
  documentation: null
});

Npm.depends({
  mongodb: "2.2.4"
});

Package.onUse(function (api) {
  api.export(['NpmModuleMongodb', 'NpmModuleMongodbVersion'], 'server');
  api.addFiles('wrapper.js', 'server');
});
