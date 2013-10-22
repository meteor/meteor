Package.describe({
  summary: "Password support for accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('srp', ['client', 'server']);
  api.use('email', ['server']);
  api.use('random', ['server']);
  api.use('check', ['server']);
  api.use('underscore');
  api.use('livedata', ['client', 'server']);

  api.add_files('email_templates.js', 'server');
  api.add_files('password_server.js', 'server');
  api.add_files('password_client.js', 'client');
});

Package.on_test(function(api) {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'deps',
           'accounts-base', 'random', 'email', 'underscore', 'check',
           'livedata']);
  api.add_files('password_tests_setup.js', 'server');
  api.add_files('password_tests.js', ['client', 'server']);
  api.add_files('email_tests_setup.js', 'server');
  api.add_files('email_tests.js', 'client');
});
