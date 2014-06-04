// XXX COMPAT WITH 0.8.1.3
// This package is replaced by the use of bcrypt in accounts-password,
// but we are leaving in some of the code to allow existing user
// databases to be upgraded from SRP to bcrypt.

Package.describe({
  summary: "Library for Secure Remote Password (SRP) exchanges",
  internal: true
});

Package.on_use(function (api) {
  api.use(['random', 'check', 'sha'], ['client', 'server']);
  api.use('underscore');
  api.export('SRP');
  api.add_files(['biginteger.js', 'srp.js'],
                ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('srp', ['client', 'server']);
  api.use('underscore');
  api.add_files(['srp_tests.js'], ['client', 'server']);
});
