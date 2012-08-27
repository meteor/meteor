Package.describe({
  summary: "Generate absolute URLs pointing to the application"
});

Package.on_use(function (api) {
  // note server before common. usually it is the other way around, but
  // in this case server must load first.
  api.add_files('url_server.js', 'server');
  api.add_files('url_common.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('absolute-url', ['client', 'server']);
  api.use('tinytest');

  api.add_files('url_tests.js', ['client', 'server']);
});
