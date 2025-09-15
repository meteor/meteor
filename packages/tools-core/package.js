Package.describe({
  summary: "Helpers for managing modern tools in Meteor",
  version: '1.0.0-beta340.8',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);

  api.mainModule('tools-core_server.js', 'server');
});
