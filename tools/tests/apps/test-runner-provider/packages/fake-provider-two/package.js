Package.describe({
  name: 'fake-provider-two',
  version: '1.0.0',
  summary: 'Second generic test-runner provider activation fixture',
});

Package.onUse(function (api) {
  api.use('fake-provider-two-tooling');
});
