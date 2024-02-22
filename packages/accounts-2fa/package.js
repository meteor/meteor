Package.describe({
  version: '3.0.0-beta300.2',
  summary:
    'Package used to enable two factor authentication through OTP protocol',
});

Npm.depends({
  'node-2fa': '2.0.3',
  'qrcode-svg': '1.1.0',
});

Package.onUse(function(api) {
  api.use(['accounts-base'], ['client', 'server']);

  // Export Accounts (etc.) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('ecmascript');
  api.use('check', 'server');

  api.addFiles(['2fa-client.js'], 'client');
  api.addFiles(['2fa-server.js'], 'server');
});

Package.onTest(function(api) {
  api.use([
    'accounts-base',
    'accounts-password',
    'ecmascript',
    'tinytest',
    'random',
    'accounts-2fa',
  ]);

  api.mainModule('server_tests.js', 'server');
  api.mainModule('client_tests.js', 'client');
});
