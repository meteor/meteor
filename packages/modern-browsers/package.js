Package.describe({
  name: 'modern-browsers',
  version: '0.1.10-beta300.6',
  summary:
    'API for defining the boundary between modern and legacy ' +
    'JavaScript clients',
  documentation: 'README.md',
});

Package.onUse(function(api) {
  api.use('modules');
  api.mainModule('modern.js', 'server');
  api.addAssets('modern.d.ts', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('modern-browsers');
  api.mainModule('modern-tests.js', 'server');
});
