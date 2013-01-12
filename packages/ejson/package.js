Package.describe({
  summary: "Extended and Extensable JSON library",
  internal: false
});

Package.on_use(function (api) {
  api.use('json');
  api.add_files('base64.js', ['client', 'server']);
  api.add_files('ejson.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('ejson', ['client', 'server']);
  api.add_files('base64_test.js', ['client', 'server']);
});
