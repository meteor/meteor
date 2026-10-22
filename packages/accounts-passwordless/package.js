Package.describe({
  summary: 'No-password login/sign-up support for accounts',
  version: '3.0.2',
});

Package.onUse(api => {
  api.use(['accounts-base', 'sha', 'ejson', 'ddp'], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('tracker', 'client');
  api.use('email', 'server');
  api.use('random', 'server');
  api.use('check', 'server');
  api.use('ecmascript');

  api.addFiles('email_templates.js', 'server');
  api.addFiles('passwordless_server.js', 'server');
  api.addFiles('passwordless_client.js', 'client');
  api.addFiles('server_utils.js', 'server');
});

Package.onTest(function(api) {
  api.use(['accounts-base', 'ecmascript', 'tinytest', 'sha']);

  api.use(['accounts-passwordless', 'ddp', 'random'], 'server');
  api.addFiles('server_utils.js', 'server');
  api.use('accounts-2fa', 'server');
  api.addFiles('passwordless_user_token_tests.js', 'server');
  api.addFiles('passwordless_login_race_tests.js', 'server');
  api.addFiles('compatibility_runtime_tests.js', 'server');
  api.mainModule('server_tests.js', 'server');
});
