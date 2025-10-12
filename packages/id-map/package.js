Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.2.0',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('harry97:cbor@1.1.17');
  api.mainModule('id-map.js');
  api.export('IdMap');
});
