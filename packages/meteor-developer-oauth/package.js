Package.describe({
  summary: 'Meteor developer accounts OAuth flow',
  version: '1.2.1'
});

Package.onUse(api => {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['ecmascript', 'service-configuration'], ['client', 'server']);
  api.use('random', 'client');

  api.addFiles('meteor_developer_common.js');
  api.addFiles('meteor_developer_server.js', 'server');
  api.addFiles('meteor_developer_client.js', 'client');

  api.export('MeteorDeveloperAccounts');
});
