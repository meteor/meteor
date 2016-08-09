Package.describe({
  summary: "JS simulation of MongoDB ObjectIDs",
  version: '1.0.5',
  documentation: null,
  git: 'https://github.com/meteor/meteor/tree/master/packages/mongo-id'
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'id-map', 'random']);
  api.addFiles([
    'id.js'
  ]);
});
