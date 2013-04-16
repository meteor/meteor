Package.describe({
  summary: "Library for manipulating documents based on data."
});

Package.on_use(function (api) {
  api.add_files('d3.v3.js', 'client');
});
