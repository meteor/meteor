Package.describe({
  name: 'with-main-module',
  version: '0.0.1'
});

Package.onUse(function(api) {
  api.versionsFrom('1.3.2.4');
  api.use('ecmascript');
  api.mainModule('with-main-module.js');
});
