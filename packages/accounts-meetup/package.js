Package.describe({
  summary: "Login service for Meetup accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('oauth2', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['meetup_login_button.css', 'meetup_configure.html', 'meetup_configure.js'],
    'client');

  api.add_files('meetup_common.js', ['client', 'server']);
  api.add_files('meetup_server.js', 'server');
  api.add_files('meetup_client.js', 'client');
});
