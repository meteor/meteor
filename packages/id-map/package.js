Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.3-githubble.43'
});

Package.onUse(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'json', 'ejson']);
  api.addFiles([ 'id-map.js' ]);
});
