Package.describe({
  summary: "Display internal app statistics",
  version: '1.0.1'
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'facts-base',
    'mongo',
    'templating@1.2.13'
  ], 'client');

  api.imply('facts-base');

  api.addFiles('facts_ui.html', 'client');
  api.mainModule('facts_ui_client.js', 'client');

  api.export('Facts', 'client');
});
