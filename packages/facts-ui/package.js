Package.describe({
  summary: "Display internal app statistics",
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'facts-base',
    'templating@1.2.13'
  ], 'client');
  if (!process.env.DISABLE_FIBERS) {
    api.use('mongo', 'client');
  } else {
    api.use('mongo-async', 'client');
  }
  api.imply('facts-base');

  api.addFiles('facts_ui.html', 'client');
  api.mainModule('facts_ui_client.js', 'client');

  api.export('Facts', 'client');
});
