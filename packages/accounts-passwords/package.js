Package.describe({
  summary: "Password support for accounts."
});

Package.on_use(function(api) {
  api.use('accounts', ['client', 'server']);
  api.use('srp', ['client', 'server']);

  api.add_files('passwords_server.js', 'server');
  api.add_files('passwords_client.js', 'client');
  api.add_files('passwords_common.js', ['server', 'client']);
});

Package.on_test(function(api) {
  api.use(['accounts-passwords', 'tinytest', 'test-helpers']);
  api.add_files('passwords_tests_setup.js', 'server');
  api.add_files('passwords_tests.js', 'client');
  api.add_files('email_tests_setup.js', 'server');
  api.add_files('email_tests.js', 'client');
});
