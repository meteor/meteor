Package.describe({
  summary: "Provides Meteor.startup",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('startup_client.js', 'client');
  api.add_files('startup_server.js', 'server');
});
