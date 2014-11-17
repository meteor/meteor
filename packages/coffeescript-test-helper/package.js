Package.describe({
  summary: "Used by the coffeescript package's tests",
  version: "1.0.1-win.0"
});

Package.on_use(function (api) {
  api.use('coffeescript', ['client', 'server']);
  api.export('COFFEESCRIPT_EXPORTED');
  api.add_files("exporting.coffee", ['client', 'server']);
});
