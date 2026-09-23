Package.describe({
  summary: 'JS simulation of MongoDB ObjectIDs',
  version: '1.0.10-beta360.1',
  documentation: null
});

Package.onUse(function (api) {
  api.export('MongoID');
  api.use(['ejson', 'random', 'ecmascript']);
  api.mainModule('id.js');
  api.types('mongo-id.d.ts');
});
