// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: '2.2.31',
  documentation: null
});

Npm.depends({
  // Fork of mongodb@2.2.31 whose only change is pointing at a mongodb-core
  // with https://github.com/mongodb-js/mongodb-core/pull/224
  // NOTE: For the time being, we have hard-coded "2.2.31" as the version
  // number in wrapper.js. When reverting back to non-fork, revert that
  // change too!
  mongodb: "https://github.com/meteor/node-mongodb-native/tarball/0f54d887aef0f172fd48cf4eafd0cf7e5a2500af",
});

Package.onUse(function (api) {
  api.export(['NpmModuleMongodb', 'NpmModuleMongodbVersion'], 'server');
  api.addFiles('wrapper.js', 'server');
});
