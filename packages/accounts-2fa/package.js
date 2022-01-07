Package.describe({
  name: 'accounts-2fa',
  version: '1.0.0',
  summary: 'Package used to enable two factor authentication through OTP protocol',
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  "node-2fa": "2.0.3",
  "qrcode-svg": "1.1.0",
});

Package.onUse(function(api) {
  api.use(['accounts-base'], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);


  api.use("ecmascript");

  api.addFiles(["2fa-client.js"], 'client');
  api.addFiles(["2fa-server.js"], 'server');
  api.addFiles(["utils.js"], ['client', 'server']);
});
