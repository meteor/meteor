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
  api.use("ecmascript");

  api.addFiles([
    "utils.js",
  ], 'server');

  api.mainModule('index.js', 'server');
});
