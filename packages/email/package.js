Package.describe({
  summary: "Send email messages",
  version: "2.0.0"
});

Npm.depends({
  nodemailer: "6.4.6",
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
