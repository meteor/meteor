Package.describe({
  summary: "Send email messages"
});

Npm.depends({
  // Pinned at older version. 0.1.16+ uses mimelib, not mimelib-noiconv which is
  // much bigger. We need a better solution.
  mailcomposer: "0.1.15",
  simplesmtp: "0.3.10",
  "stream-buffers": "0.2.5"});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.use('application-configuration');
  api.export('Email', 'server');
  api.export('EmailTest', 'server', {testOnly: true});
  api.add_files('email.js', 'server');
});

Package.on_test(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.add_files('email_tests.js', 'server');
});
