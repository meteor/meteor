Package.describe({
  summary: "Role-based authorization"
});

Package.on_use(function (api) {
  var both = ['client', 'server'];
  api.use(['underscore', 'handlebars', 'accounts-base'], both);

  api.export && api.export('Roles'); 

  api.add_files('roles_server.js', 'server');
  api.add_files('roles_common.js', both);
  api.add_files('roles_client.js', 'client');
});

Package.on_test(function (api) {
  // include accounts-password so Meteor.users exists
  api.use(['roles','accounts-password','tinytest'], 'server');

  api.add_files('tests/server.js', 'server');
  api.add_files('tests/client.js', 'client');
});
