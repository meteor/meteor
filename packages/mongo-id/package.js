Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  version: '1.0.9-alpha300.19',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'random', 'ecmascript']);
  api.mainModule('id.js');
});
