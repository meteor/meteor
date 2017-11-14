Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.9'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.mainModule('id-map.js');
  api.export('IdMap');
});
