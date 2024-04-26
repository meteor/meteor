Package.describe({
  summary: 'Send email messages',
  version: '2.2.6-beta2160.0',
});

Npm.depends({
  nodemailer: '6.9.10',
  'stream-buffers': '3.0.2',
  '@types/nodemailer': '6.4.14',
  'nodemailer-openpgp' : '2.2.0'
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'logging', 'callback-hook'], 'server');
  api.addAssets('email.d.ts', 'server');
  api.mainModule('email.js', 'server');
  api.export(['Email', 'EmailInternals'], 'server');
  api.export('EmailTest', 'server', { testOnly: true });
});

Package.onTest(function(api) {
  api.use('email', 'server');
  api.use(['tinytest', 'ecmascript']);
  api.addFiles('email_tests.js', 'server');
});
