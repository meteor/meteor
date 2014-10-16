Package.describe({
  summary: "Run server tests noninteractively, with results going to the console.",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.use(['tinytest', 'underscore', 'ejson'], 'server');

  api.add_files(['server.js'], "server");
});
