Package.describe({
  summary: "Library for manipulating documents based on data",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.export('d3', 'client');
  api.add_files('d3.v3.js', 'client');
});
