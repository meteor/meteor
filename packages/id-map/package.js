Package.describe({
  summary: "Dictionary data structure: a wrapper for a raw object",
  internal: true
});

Package.on_use(function (api) {
  api.export('IdMap');
  api.use(['underscore', 'json', 'ejson']);
  api.add_files([ 'id-map.js' ]);
});

