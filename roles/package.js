Package.describe({
  summary: "Authorization package for Meteor",
  version: "1.2.14",
  git: "https://github.com/alanning/meteor-roles.git",
  name: "alanning:roles"
});

Package.onUse(function (api) {
  var both = ['client', 'server'];

  api.versionsFrom && api.versionsFrom("METEOR@1.2.0.2");

  api.use(['underscore', 'accounts-base', 'check'], both);
  api.use(['blaze'], 'client', {weak: true});

  api.export && api.export('Roles');

  api.addFiles('roles_server.js', 'server');
  api.addFiles('roles_common.js', both);
  api.addFiles('roles_client.js', 'client');
});

Package.onTest(function (api) {
  var both = ['client', 'server'];

  // `accounts-password` is included so `Meteor.users` exists

  api.use(['alanning:roles','accounts-password','tinytest'], both);

  api.addFiles('tests/client.js', 'client');
  api.addFiles('tests/server.js', 'server');
});
