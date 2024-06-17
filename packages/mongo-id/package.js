Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  version: '1.0.9-rc300.4',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'random', 'ecmascript']);
  api.mainModule('id.js');
});
