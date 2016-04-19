// This has been moved out of the `mongo` package so it can be used by the tool
// via isopacket, without having to also load ddp-server.

Package.describe({
  summary: "Wrapper around the mongo npm package",
  version: '1.4.43',
  documentation: null
});

Npm.depends({
  // 1.4.32 (and bson 0.2.18) with optional native dependencies (bson native
  // piece and kerberos) ripped out, which means we don't have to do the
  // publish-for-arch dance every time we make a Meteor release.
  // XXX move the npm dependency into a non-core versioned package and allow
  //     it to use C++ bson
  mongodb: "https://github.com/meteor/node-mongodb-native/tarball/9c7441e87fbec059dc0b70bbb70734404b994d71"
});

Package.onUse(function (api) {
  api.export(['NpmModuleMongodb', 'NpmModuleMongodbVersion'], 'server');
  api.addFiles('wrapper.js', 'server');
});
