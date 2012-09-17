Package.describe({
  summary: "Extension to the deps package to simplify common tasks"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use('deps', where);
  api.add_files('deps-extensions.js', where);
});


Package.on_test(function (api) {
  api.use('deps-extensions', ['client', 'server']);
  api.use('test-helpers', ['client', 'server']);
  api.use('tinytest');

  api.add_files('deps-extensions_tests.js', ['client', 'server']);
});
