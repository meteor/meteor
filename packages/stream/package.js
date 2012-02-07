Package.describe({
  summary: "Meteor's reliable message delivery module",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'uuid'], ['client', 'server']);
  api.use('reload', 'client');
  api.add_files('stream_client.js', 'client');
  api.add_files('stream_server.js', 'server');
});
