Package.describe({
  summary: "Library for Secure Remote Password (SRP) exchanges",
  internal: true
});

Package.on_use(function (api) {
  api.use(['random', 'check'], ['client', 'server']);
  api.use('underscore');
  api.export('SRP');
  api.add_files(['biginteger.js', 'sha256.js', 'srp.js'],
                ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('srp', ['client', 'server']);
  api.use('underscore');
  api.add_files(['srp_tests.js'], ['client', 'server']);
});
