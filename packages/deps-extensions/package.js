Package.describe({
  summary: "Extension to the deps package to simplify common tasks"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use('deps', where);
  api.add_files('deps-extensions.js', where);
});
