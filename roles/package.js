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
  var both = ['client', 'server'];

  // include accounts-password so Meteor.users exists
  api.use(['roles','accounts-password','tinytest'], both);

  api.add_files('tests/client.js', 'client');
  api.add_files('tests/server.js', 'server');
});
