Package.describe({
  summary: "Accounts service for Meetup accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('meetup', ['client', 'server']);

  api.add_files('meetup_login_button.css', 'client');

  api.add_files('meetup_common.js', ['client', 'server']);
  api.add_files('meetup_server.js', 'server');
  api.add_files('meetup_client.js', 'client');
});
