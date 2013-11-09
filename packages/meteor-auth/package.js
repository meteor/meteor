Package.describe({
  summary: "Meteor accounts OAuth flow",
  internal: true
});

Package.on_use(function (api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random', 'templating'], 'client');

  api.export('MeteorAccounts');

  api.add_files(['meteor_auth_configure.html',
                 'meteor_auth_configure.js'], 'client');
  api.add_files('meteor_auth_server.js', 'server');
  api.add_files('meteor_auth_client.js', 'client');
});
