Package.describe({
  summary: "Used by the coffeescript package's tests",
  version: "1.0.10-beta.30"
});

Package.onUse(function (api) {
  api.use('coffeescript@1.12.7-2-beta.30', ['client', 'server']);
  api.export('COFFEESCRIPT_EXPORTED');
  api.export('COFFEESCRIPT_EXPORTED_ONE_MORE');
  api.export('COFFEESCRIPT_EXPORTED_WITH_BACKTICKS');
  api.addFiles("exporting.coffee", ['client', 'server']);
});
