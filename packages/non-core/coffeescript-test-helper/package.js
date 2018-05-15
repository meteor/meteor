Package.describe({
  summary: "Used by the coffeescript package's tests",
  version: "1.1.3"
});

Package.onUse(function (api) {
  api.use('coffeescript@2.2.1_1', ['client', 'server']);
  api.export('COFFEESCRIPT_EXPORTED');
  api.export('COFFEESCRIPT_EXPORTED_ONE_MORE');
  api.export('COFFEESCRIPT_EXPORTED_WITH_BACKTICKS');
  api.addFiles("exporting.coffee", ['client', 'server']);
});
