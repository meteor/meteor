Package.describe({
  summary: 'Send email messages',
  version: '2.2.1',
});

Npm.depends({
  nodemailer: '6.6.3',
  'stream-buffers': '3.0.2',
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'logging', 'callback-hook'], 'server');
  api.mainModule('email.js', 'server');
  api.export(['Email', 'EmailInternals'], 'server');
  api.export('EmailTest', 'server', { testOnly: true });
});

Package.onTest(function(api) {
  api.use('email', 'server');
  api.use(['tinytest', 'ecmascript']);
  api.addFiles('email_tests.js', 'server');
});
