Package.describe({
  name: 'accounts-webauthn',
  summary:
    'WebAuthn (FIDO2) security key and passkey login, plus second-factor support, for accounts',
  version: '1.0.0',
});

Npm.depends({
  '@simplewebauthn/server': '14.0.2',
  '@simplewebauthn/browser': '14.0.0',
});

Package.onUse(api => {
  api.use(['accounts-base'], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('ecmascript');
  api.use('check', 'server');
  api.use('mongo', 'server');

  api.mainModule('server/index.js', 'server');
  api.mainModule('client/index.js', 'client');

  api.types('accounts-webauthn.d.ts');
});

Package.onTest(api => {
  api.use([
    'accounts-base',
    'accounts-password',
    'accounts-passwordless',
    'accounts-2fa',
    'accounts-webauthn',
    'ecmascript',
    'tinytest',
    'test-helpers',
    'random',
    'check',
    'mongo',
    'ddp',
  ]);

  api.mainModule('server_tests.js', 'server');
  api.mainModule('client_tests.js', 'client');
});
