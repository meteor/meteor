Package.describe({
  summary: "Password support for accounts",
  version: "1.1.1"
});

Package.onUse(function(api) {
  api.use('npm-bcrypt@=0.7.8_2');

  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('srp', ['client', 'server']);
  api.use('sha', ['client', 'server']);
  api.use('email', ['server']);
  api.use('random', ['server']);
  api.use('check');
  api.use('underscore');
  api.use('ddp', ['client', 'server']);

  api.addFiles('email_templates.js', 'server');
  api.addFiles('password_server.js', 'server');
  api.addFiles('password_client.js', 'client');
});

Package.onTest(function(api) {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'underscore', 'check',
           'ddp']);
  api.addFiles('password_tests_setup.js', 'server');
  api.addFiles('password_tests.js', ['client', 'server']);
  api.addFiles('email_tests_setup.js', 'server');
  api.addFiles('email_tests.js', 'client');
});
