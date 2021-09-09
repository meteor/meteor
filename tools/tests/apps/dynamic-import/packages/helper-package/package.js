Package.describe({
  name: 'helper-package',
  version: '0.0.1',
});

Package.onUse(function(api) {
//  api.versionsFrom('1.4.2.7');
  api.use('ecmascript');
  api.use('coffeescript');
  api.mainModule('helper-package.js');
  api.export("Helper");
});
