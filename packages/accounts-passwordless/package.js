Package.describe({
  summary: 'No-password login/sign-up support for accounts',
  version: '2.1.1',
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
