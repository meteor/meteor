Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  name: 'harry97:mongo-id',
  version: '0.3.0',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson@1.1.5', 'harry97:cbor@1.2.1', 'random@1.2.2', 'ecmascript@0.16.13']);
  api.mainModule('id.js');
});
