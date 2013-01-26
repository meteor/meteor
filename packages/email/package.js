Package.describe({
  summary: "Send email messages"
});

// Pinned at older version. 0.1.16+ uses mimelib, not mimelib-noiconv
// which is much bigger. We need a better solution.
Npm.depends({mailcomposer: "0.1.15", simplesmtp: "0.1.25", "stream-buffers": "0.2.3"});

Package.on_use(function (api) {
  api.add_files('email.js', 'server');
});

Package.on_test(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.add_files('email_tests.js', 'server');
});
