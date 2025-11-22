Package.describe({
  summary: "Helpers for managing modern tools in Meteor",
  version: '1.0.0-beta340.14',
  devOnly: true,
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);

  api.mainModule('tools-core.js', 'server');
});
