Package.describe({
  summary: "Run server tests noninteractively, with results going to the console.",
  version: '1.0.10',
  git: 'https://github.com/meteor/meteor/tree/master/packages/test-server-tests-in-console-once'
});

Package.onUse(function (api) {
  api.use(['tinytest', 'underscore', 'ejson'], 'server');

  api.addFiles(['server.js'], "server");
});
