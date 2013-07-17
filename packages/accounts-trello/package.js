Package.describe({
  summary: "Login service for Trello accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('trello', ['client', 'server']);

  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files('trello_login_button.css', 'client');

  api.add_files('trello_common.js', ['client', 'server']);
  api.add_files('trello_server.js', 'server');
  api.add_files('trello_client.js', 'client');
});