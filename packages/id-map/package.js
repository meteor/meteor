Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.4-plugins.0'
});

Package.onUse(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'json', 'ejson']);
  api.addFiles([ 'id-map.js' ]);
});
