Package.describe({
  summary: "Meetup OAuth flow",
  version: "1.1.1"
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating', 'client');
  api.use('underscore', 'client');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.export('Meetup');

  api.add_files(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client');

  api.add_files('meetup_server.js', 'server');
  api.add_files('meetup_client.js', 'client');
});
