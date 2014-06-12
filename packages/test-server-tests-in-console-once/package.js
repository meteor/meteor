Package.describe({
  name: 'test-server-tests-in-console-once',
  summary: "Run server tests noninteractively, with results going to the console.",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
  api.use(['tinytest', 'underscore', 'ejson'], 'server');

  api.add_files(['server.js'], "server");
});
