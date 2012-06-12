Package.describe({
  summary: "A user account system",
});

Package.on_use(function(api) {
  api.use('underscore', 'server');
  api.use('localstorage-polyfill', 'client');

  api.add_files('accounts_common.js', ['client', 'server']);
  api.add_files('accounts_server.js', 'server');

  api.add_files('localstorage_token.js', 'client');
  api.add_files('accounts_client.js', 'client');
});