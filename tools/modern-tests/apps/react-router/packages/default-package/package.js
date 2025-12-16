Package.describe({
  name: 'default-package',
  summary: 'Default package for react-router',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);

  api.mainModule('default-package.js', ['client', 'server']);
});
