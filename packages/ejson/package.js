Package.describe({
  summary: "Extended and Extensible JSON library",
  version: '1.0.4'
});

Package.on_use(function (api) {
  api.use(['json', 'underscore', 'base64']);
  api.export('EJSON');
  api.export('EJSONTest', {testOnly: true});
  api.add_files('ejson.js', ['client', 'server']);
  api.add_files('stringify.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('ejson', ['client', 'server']);
  api.use(['tinytest', 'underscore']);

  api.add_files('custom_models_for_tests.js', ['client', 'server']);
  api.add_files('ejson_test.js', ['client', 'server']);
});
