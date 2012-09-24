Package.describe({
  summary: "Backwards compatibility.",
  internal: true
});

Package.on_use(function (api) {
  api.use('deps');
  api.add_files('past.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('past');
  api.use('tinytest');

  api.add_files('client_past_test.js', 'client');
  api.add_files('server_past_test.js', 'server');
});
