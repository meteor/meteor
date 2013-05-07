Package.describe({
  summary: "Accounts service for Google accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('google', ['client', 'server']);

  api.add_files('google_login_button.css', 'client');

  api.add_files('google_common.js', ['client', 'server']);
  api.add_files('google_server.js', 'server');
  api.add_files('google_client.js', 'client');
});
