Package.describe({
  summary: "Generate and consume reset password and verify account URLs",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('url_client.js', 'client');
  api.add_files('url_server.js', 'server');
});
