// XXX COMPAT WITH 0.8.3
// This package is replaced by the use of bcrypt in accounts-password,
// but we are leaving in some of the code to allow existing user
// databases to be upgraded from SRP to bcrypt.

Package.describe({
  summary: "Library for Secure Remote Password (SRP) exchanges",
  version: "1.0.4"
});

Package.onUse(function (api) {
  api.use(['random', 'check', 'sha'], ['client', 'server']);
  api.use('underscore');
  api.export('SRP');
  api.addFiles(['biginteger.js', 'srp.js'],
                ['client', 'server']);
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('srp', ['client', 'server']);
  api.use('underscore');
  api.addFiles(['srp_tests.js'], ['client', 'server']);
});
