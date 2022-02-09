Package.describe({
  version: '1.0.0-beta261.2',
  summary:
    'Package used to enable two factor authentication through OTP protocol',
});

Npm.depends({
  'node-2fa': '2.0.3',
  'qrcode-svg': '1.1.0',
});

Package.onUse(function(api) {
  api.use(['accounts-base'], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('ecmascript');

  api.addFiles(['2fa-client.js'], 'client');
  api.addFiles(['2fa-server.js'], 'server');
});
