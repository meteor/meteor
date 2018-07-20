Package.describe({
  summary: 'Meetup OAuth flow',
  version: '1.0.3'
});

Package.onUse(api => {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('meetup_server.js', 'server');
  api.addFiles('meetup_client.js', 'client');

  api.export('Meetup');
});
