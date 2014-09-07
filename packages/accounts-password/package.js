Package.describe({
  summary: "Password support for accounts",
  version: "1.0.1"
});

Package.on_use(function(api) {
  api.use('npm-bcrypt@=0.7.7', 'server');

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

  api.add_files('email_templates.js', 'server');
  api.add_files('password_server.js', 'server');
  api.add_files('password_client.js', 'client');
});

Package.on_test(function(api) {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'underscore', 'check',
           'ddp']);
  api.add_files('password_tests_setup.js', 'server');
  api.add_files('password_tests.js', ['client', 'server']);
  api.add_files('email_tests_setup.js', 'server');
  api.add_files('email_tests.js', 'client');
});
