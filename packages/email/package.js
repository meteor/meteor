Package.describe({
  summary: "Send email messages",
  version: "1.0.7"
});

Npm.depends({
  // Pinned at older version. 0.1.16+ uses mimelib, not mimelib-noiconv which is
  // much bigger. We need a better solution.
  mailcomposer: "0.1.15",
  simplesmtp: "0.3.10",
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
