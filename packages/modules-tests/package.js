Package.describe({
  name: 'modules-tests',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'A package with tests for the modules package'
});

Package.onUse(function(api) {
  api.use('modules');
  api.export('requiredFoo');
  api.mainModule('main.js');
});

Package.onTest(function(api) {
  api.use('modules-tests');
  api.use('tinytest');
  api.addFiles('modules-tests.js');
});
