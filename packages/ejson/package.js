Package.describe({
  summary: "Extended and Extensible JSON library",
  version: '1.0.14'
});

Package.onUse(function (api) {
  api.use(['underscore', 'base64']);
  api.mainModule('ejson.js');
  api.addFiles('stringify.js');
  api.export('EJSON');
  api.export('EJSONTest', { testOnly: true });
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore']);
  api.use('ejson');
  api.addFiles('custom_models_for_tests.js');
  api.mainModule('ejson_tests.js');
});
