Package.describe({
  summary : "Login service for Tencent QQ accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth2-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(['qq_configure.html', 'qq_configure.js'], 'client');

  api.add_files('qq_common.js', ['client', 'server']);
  api.add_files('qq_server.js', 'server');
  api.add_files('qq_client.js', 'client');
});
