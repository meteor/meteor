Package.describe({
  summary: "Password support for accounts",
  version: "1.3.0"
});

Package.onUse(function(api) {
  api.use('npm-bcrypt@0.9.0', 'server');

  api.use([
    'accounts-base@1.2.10',
    'srp@1.0.9',
    'sha@1.0.8',
    'ejson@1.0.12',
    'ddp@1.2.5'
  ], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base@1.2.10', ['client', 'server']);

  api.use('email@1.1.16', ['server']);
  api.use('random@1.0.10', ['server']);
  api.use('check@1.2.3');
  api.use('underscore@1.0.9');
  api.use('ecmascript@0.5.7');

  api.addFiles('email_templates.js', 'server');
  api.addFiles('password_server.js', 'server');
  api.addFiles('password_client.js', 'client');
});

Package.onTest(function(api) {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'underscore', 'check',
           'ddp', 'ecmascript']);
  api.addFiles('password_tests_setup.js', 'server');
  api.addFiles('password_tests.js', ['client', 'server']);
  api.addFiles('email_tests_setup.js', 'server');
  api.addFiles('email_tests.js', 'client');
});
