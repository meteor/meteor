Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.3-rc.0'
});

Package.onUse(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'json', 'ejson']);
  api.addFiles([ 'id-map.js' ]);
});
