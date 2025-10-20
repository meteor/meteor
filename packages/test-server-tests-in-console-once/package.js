Package.describe({
  summary: "Run server tests noninteractively, with results going to the console.",
  version: '1.0.13',
});

Npm.depends({
  'lodash.has': '4.5.2'
});

Package.onUse(function (api) {
  api.use(['tinytest', 'harry97:cbor@1.2.1'], 'server');

  api.addFiles(['server.js'], "server");
});
