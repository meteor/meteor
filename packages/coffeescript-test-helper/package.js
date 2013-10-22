Package.describe({
  summary: "Used by the coffeescript package's tests",
  internal: true
});

Package.on_use(function (api) {
  api.use('coffeescript', ['client', 'server']);
  api.export('COFFEESCRIPT_EXPORTED');
  api.add_files("exporting.coffee", ['client', 'server']);
});
