Package.describe({
  name: 'tinytest-e2e-fixture',
  version: '0.0.1',
  summary: 'Meteor legacy package-test ownership fixture',
});

Package.onTest(api => {
  api.versionsFrom('3.4');
  api.use(['ecmascript', 'tinytest']);
  api.addFiles('fixture.tests.js');
});
