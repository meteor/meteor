Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  name: 'mongo-id',
  version: '1.0.9',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['harry97:cbor', 'random', 'ecmascript']);
  api.mainModule('id.js');
});
