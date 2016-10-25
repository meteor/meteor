Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.9'
});

Package.onUse(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'ejson']);
  api.addFiles([ 'id-map.js' ]);
});
