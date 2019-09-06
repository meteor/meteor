Package.describe({
  name: 'test-package',
  version: '0.0.1',
  summary: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule('client.js', 'client');
  api.mainModule('server.js', 'server');
});
