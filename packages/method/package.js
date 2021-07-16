Package.describe({
  name: 'method',
  version: '0.1.0',
  summary: 'Advanced meteor methods, with more control',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply(['meteor', 'ddp']);
  api.use(['check']);
  api.mainModule('method_client.js', 'client');
  api.mainModule('method_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'check']);

  api.addFiles('method_tests_setup.js');
  api.mainModule("method_tests_server.js", 'server');
  api.mainModule("method_tests_client.js", 'client');
});
