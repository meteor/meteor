Package.describe({
  name: 'modules-test-package',
  version: '0.0.1',
  summary: 'local test package',
  documentation: 'README.md'
});

Npm.depends({
  "os-browserify": "0.2.0",
  "assert": "1.3.0"
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.use('templating');
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("ModulesTestPackage");
});
