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
