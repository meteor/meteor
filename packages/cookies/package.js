Package.describe({
  summary: "Parsing cookies",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.export('Cookies', ['client', 'server']);
  api.add_files('cookies.js', ['client', 'server']);
  api.add_files('cookies_client.js', ['client']);
});

Package.on_test(function (api) {
  api.use('cookies', ['client', 'server']);
  api.use('tinytest', ['client', 'server']);
  api.use('random', ['client']);

  api.add_files('cookies_test.js', ['client', 'server']);
  api.add_files('cookies_client_test.js', ['client']);
});
