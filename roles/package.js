Package.describe({
  summary: "Role-based authorization"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.use(['underscore', 'accounts-base'], where);
  api.add_files('roles_server.js', 'server');
  api.add_files('roles_common.js', where);
  api.add_files('roles_client.js', 'client');
});

Package.on_test(function (api) {
  // include accounts-password so Meteor.users exists
  api.use('accounts-password', 'server');

  api.use('tinytest', 'server');
  api.add_files('tests/server.js', 'server');

  api.use(['accounts-base', 'tinytest'], 'client');
  api.add_files('tests/client.js', 'client');
});
