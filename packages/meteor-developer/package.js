Package.describe({
  summary: "Meteor developer accounts OAuth flow",
  version: "1.1.10-release-testing.0"
});

Package.onUse(function (api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random', 'templating@1.2.13'], 'client');

  api.export('MeteorDeveloperAccounts');

  api.addFiles('meteor_developer_common.js');
  api.addFiles(['meteor_developer_configure.html',
                 'meteor_developer_configure.js'], 'client');
  api.addFiles('meteor_developer_server.js', 'server');
  api.addFiles('meteor_developer_client.js', 'client');
});
