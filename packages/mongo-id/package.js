Package.describe({
  summary: "JS simulation of MongoDB ObjectIDs",
  version: '1.0.0-plugins.0',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'id-map', 'random']);
  api.addFiles([
    'id.js'
  ]);
});

