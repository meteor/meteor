Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  version: '2.0.0-alpha300.9',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'random', 'ecmascript']);
  api.mainModule('id.js');
});
