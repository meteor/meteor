Package.describe({
  name: 'extra-package-1',
  version: '0.0.1',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule('extra-package-1.js');
});
