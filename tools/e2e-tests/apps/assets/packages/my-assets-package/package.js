Package.describe({
  name: 'my-assets-package',
  version: '1.0.0',
  summary: 'Test package for assets',
});

Package.onUse(function(api) {
  api.versionsFrom('3.0');
  api.use('ecmascript');
  
  api.addAssets('server-asset.txt', 'server');
  api.addAssets('client-asset.txt', 'client');
  
  api.mainModule('server.js', 'server');
  api.mainModule('client.js', 'client');
});
