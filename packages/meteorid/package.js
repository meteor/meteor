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

  api.export('MeteorId');

  api.add_files('meteorid_common.js');
  api.add_files(['meteorid_configure.html',
                 'meteorid_configure.js'], 'client');
  api.add_files('meteorid_server.js', 'server');
  api.add_files('meteorid_client.js', 'client');
});
