Package.describe({
  name: 'dep-package',
  version: '0.0.1',
  documentation: null
});

Package.onUse(function(api) {
  api.addFiles('dep-package.js');
  api.use('jshint');
});
