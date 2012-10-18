Package.describe({
  summary: "Library for Secure Remote Password (SRP) exchanges",
  internal: true
});

Package.on_use(function (api) {
  api.use('uuid', ['client', 'server']);
  api.add_files(['biginteger.js', 'sha256.js', 'srp.js'],
                ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('srp', ['client', 'server']);
  api.add_files(['srp_tests.js'], ['client', 'server']);
});
