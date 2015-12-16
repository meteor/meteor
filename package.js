Package.describe({
  summary: "Authorization package for Meteor",
  version: "1.2.14",
  git: "https://github.com/alanning/meteor-roles.git",
  name: "alanning:roles"
});

Package.onUse(function (api) {
  var both = ['client', 'server'];

  api.versionsFrom("METEOR@1.2.0.2");

  api.use(['underscore',
           'accounts-base',
           'tracker',
           'mongo',
           'check'], both);

  api.use(['blaze'], 'client', {weak: true});

  api.export('Roles');

  api.addFiles('roles/roles_common.js', both);
  api.addFiles('roles/roles_server.js', 'server');
  api.addFiles(['roles/client/debug.js',
                'roles/client/uiHelpers.js',
                'roles/client/subscriptions.js'], 'client');
});

Package.onTest(function (api) {
  var both = ['client', 'server'];

  // `accounts-password` is included so `Meteor.users` exists

  api.use(['alanning:roles',
           'accounts-password',
           'underscore',
           'tinytest'], both);

  api.addFiles('roles/tests/client.js', 'client');
  api.addFiles('roles/tests/server.js', 'server');
});
