Package.describe({
  name: 'rstest',
  version: '0.1.0-beta.0',
  summary: 'Test-only Rstest capability and Meteor runtime executor',
  testOnly: true,
  documentation: 'README.md',
});

Package.onUse(function (api) {
  api.versionsFrom('3.0');
  api.use(['ecmascript', 'meteor', 'rspack', 'rstest-tooling']);
  api.use('webapp', 'server');
  api.mainModule('server/main.js', 'server');
  api.mainModule('client/main.js', 'client');
  api.addAssets('runtime/api.d.ts', 'server');
});
