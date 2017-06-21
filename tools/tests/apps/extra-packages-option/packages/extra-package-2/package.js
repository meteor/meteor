Package.describe({
  name: 'extra-package-2',
  version: '0.0.2',
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule('extra-package-2.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('extra-package-2');
  api.mainModule('extra-package-2-tests.js');
});
