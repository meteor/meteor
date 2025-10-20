Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  name: 'harry97:mongo-id',
  version: '0.3.0',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['harry97:cbor', 'random', 'ecmascript']);
  api.mainModule('id.js');
});
