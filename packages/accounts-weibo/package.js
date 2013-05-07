Package.describe({
  summary: "Accounts service for Sina Weibo accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('weibo', ['client', 'server']);

  api.add_files('weibo_login_button.css', 'client');

  api.add_files('weibo_common.js', ['client', 'server']);
  api.add_files('weibo_server.js', 'server');
  api.add_files('weibo_client.js', 'client');
});
