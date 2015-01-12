// This package overrides the accounts-base package
// by using the name attribute in Package.describe.

Package.describe({
  name: "accounts-base",
  documentation: null
});

Package.onUse(function(api) {
//  api.versionsFrom('METEOR@0.9.0-rc9');
  api.addFiles('fake-accounts-base.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('accounts-base');
  api.addFiles('fake-accounts-base-tests.js');
});
