Package.describe({
  summary: "Library for manipulating documents based on data",
  version: "1.0.0"
});

Package.onUse(function (api) {
  api.export('d3', 'client');
  api.addFiles('d3.v3.js', 'client');
});
