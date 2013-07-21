Package.describe({
  summary: "Used by the coffeescript package's @export tests",
  internal: true
});

Package.on_use(function (api) {
  api.use('coffeescript', ['client', 'server']);
  api.add_files("exporting.coffee", ['client', 'server']);
});
