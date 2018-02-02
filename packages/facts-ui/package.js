Package.describe({
  summary: "Display internal app statistics",
  version: '0.0.1'
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'facts-base',
    'mongo',
    'templating@1.2.13',
    'underscore',
  ], 'client');

  api.addFiles('facts_ui.html', 'client');
  api.mainModule('facts_ui_client.js', 'client');
});
