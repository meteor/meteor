Package.describe({
  summary: "Role-based authorization"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.use(['underscore', 'accounts-base'], where);
  api.add_files('roles.js', where);
});

Package.on_test(function (api) {
  api.use(['roles', 'accounts-password', 'tinytest'], 'server');
  api.add_files('tests/server.js', 'server');
});
