Package.describe({
  summary: "Login service for Github accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth2-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['github_configure.html', 'github_configure.js'],
    'client');

  api.add_files('github_common.js', ['client', 'server']);
  api.add_files('github_server.js', 'server');
  api.add_files('github_client.js', 'client');
});
