Package.describe({
  name: 'tools',
  version: '3.4.0',
  summary: 'Type definitions for Meteor globals (Assets runtime, Package/Npm build-time)',
});

Package.onUse(function(api) {
  api.addAssets('tools.d.ts', 'server');
  api.addAssets('package-types.json', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('typescript');
  api.addAssets('tools-tests.ts', 'server');
  api.mainModule('tools-tests.ts', 'server');
});
