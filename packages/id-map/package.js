Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.2.0-alpha300.15',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.mainModule('id-map.js');
  api.export('IdMap');
});
