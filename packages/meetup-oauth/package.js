Package.describe({
  summary: 'Meetup OAuth flow',
  version: '1.1.1'
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http@1.4.4 || 2.0.0', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);

  api.addFiles('meetup_server.js', 'server');
  api.addFiles('meetup_client.js', 'client');

  api.export('Meetup');
});
