Package.describe({
  name: 'extra-package-1',
  version: '0.0.1',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule('extra-package-1.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('extra-package-1');
  api.mainModule('extra-package-1-tests.js');
});
