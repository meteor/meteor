Package.describe({
  summary: "Meteor developer accounts OAuth flow",
  internal: true
});

Package.on_use(function (api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random', 'templating'], 'client');

  api.export('MeteorDeveloperAccounts');

  api.add_files('meteor_developer_common.js');
  api.add_files(['meteor_developer_configure.html',
                 'meteor_developer_configure.js'], 'client');
  api.add_files('meteor_developer_server.js', 'server');
  api.add_files('meteor_developer_client.js', 'client');
});
