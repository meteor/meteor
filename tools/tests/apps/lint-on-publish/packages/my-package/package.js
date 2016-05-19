Package.describe({
  name: 'my-package',
  version: '0.0.1',
  documentation: null
});

Package.onUse(function(api) {
  api.addFiles('my-package.js');
  api.use('jshint');
  api.use('dep-package'); // local dependency
});

