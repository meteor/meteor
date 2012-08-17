Package.describe({
  summary: "Send email messages"
});

Package.on_use(function (api) {
  api.add_files('email.js', 'server');
});

Package.on_test(function (api) {
  api.use('email', 'server');
  api.use('tinytest');
  api.add_files('email_tests.js', 'server');
});
