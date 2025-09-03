Package.describe({
  name: 'custom-package',
  summary: 'Custom package for react-router',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);

  api.mainModule('custom-package.js', ['client', 'server']);
});
