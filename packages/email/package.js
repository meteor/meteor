Package.describe({
  summary: "Send email messages",
  version: "2.1.0"
});

Npm.depends({
  nodemailer: "6.6.0",
  "stream-buffers": "3.0.2"
});

Package.onUse(function (api) {
  api.export(['Email', 'EmailInternals'], 'server');
  api.export('EmailTest', 'server', {testOnly: true});
  api.addFiles('email.js', 'server');
});

Package.onTest(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.addFiles('email_tests.js', 'server');
});
