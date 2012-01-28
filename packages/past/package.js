Package.describe({
  summary: "Backwards compatibility.",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('past.js', ['client', 'server']);
});
