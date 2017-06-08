Package.describe({
  name: 'extra-package-2',
  version: '0.0.2',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule('extra-package-2.js');
});
