Package.describe({
  name: 'rstest-e2e-fixture',
  version: '0.0.1',
  summary: 'Meteor Rstest package-test fixture',
});

Package.onUse(api => {
  api.versionsFrom('3.4');
  api.use('ecmascript');
  api.mainModule('fixture.js');
});

Package.onTest(api => {
  api.versionsFrom('3.4');
  api.use([
    'ecmascript',
    'mongo',
    'rstest',
    'rstest-e2e-fixture',
  ]);
  api.mainModule('fixture.tests.js');
});
