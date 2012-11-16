Package.describe({
  summary: "Meteor's reliable message delivery module",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'logging', 'uuid', 'json'], ['client', 'server']);
  api.use('reload', 'client');

  api.add_files('sockjs-0.3.4.js', 'client');

  api.add_files('stream_client.js', 'client');
  api.add_files('stream_server.js', 'server');
});

Package.on_test(function (api) {
  api.use('stream', ['client', 'server']);
  api.use('http', 'client');
  api.use('test-helpers', 'client');
  api.add_files(['stream_tests.js'], 'client');
});
