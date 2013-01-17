Package.describe({
  summary: "Send email messages"
});

Package.on_use(function (api) {
  api.add_files('email.js', 'server');
  api.useNpm({mailcomposer: "0.1.15", simplesmtp: "0.1.25", "stream-buffers": "0.2.3"});
});

Package.on_test(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.add_files('email_tests.js', 'server');
});
