Package.describe({
  summary: "Display internal app statistics",
  version: '2.0.0-alpha300.9',
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'facts-base',
    'mongo',
    'templating@2.0.0-alpha300.5'
  ], 'client');

  api.imply('facts-base');

  api.addFiles('facts_ui.html', 'client');
  api.mainModule('facts_ui_client.js', 'client');

  api.export('Facts', 'client');
});
