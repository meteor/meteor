Package.describe({
  name: 'rstest-tinytest-e2e-fixture',
  version: '0.0.1',
  summary: 'Meteor same-package mixed test registry fixture',
});

Package.onTest(api => {
  api.versionsFrom('3.4');
  api.use(['ecmascript', 'rstest', 'tinytest']);
  api.mainModule('fixture.tests.js');
});
