Package.describe({
  summary: "Dictionary data structure allowing non-string keys",
  version: '1.0.8',
  git: 'https://github.com/meteor/meteor/tree/master/packages/id-map'
});

Package.onUse(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'ejson']);
  api.addFiles([ 'id-map.js' ]);
});
