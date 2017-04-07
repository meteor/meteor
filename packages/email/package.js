Package.describe({
  summary: "Send email messages",
  version: "1.2.0"
});

Npm.depends({
  mailcomposer: "4.0.1",
  // Using smtp-connection@2 (instead of latest) because it shares
  // nodemailer-shared with mailcomposer@4:
  "smtp-connection": "2.12.2",
  "stream-buffers": "0.2.5"});

Package.onUse(function (api) {
  api.use('underscore', 'server');
  api.export(['Email', 'EmailInternals'], 'server');
  api.export('EmailTest', 'server', {testOnly: true});
  api.addFiles('email.js', 'server');
});

Package.onTest(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.addFiles('email_tests.js', 'server');
});
