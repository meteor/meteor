Package.describe({
  summary: "Send email messages",
  version: "1.2.3"
});

Npm.depends({
  node4mailer: "4.0.3",
  "stream-buffers": "0.2.5"
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
