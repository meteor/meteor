Package.describe({
  summary: "Role-based authorization"
});

Package.on_use(function (api) {
  var both = ['client', 'server'];
  api.use(['underscore', 'accounts-base'], both);
  api.use(['handlebars'], 'client', {weak: true});
  if(uiExists()) {
    api.use(['ui'], 'client');
  }

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

// workaround for meter issue #1358
// https://github.com/meteor/meteor/issues/1358
function uiExists() {
  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var meteorPackages = fs.readFileSync(path.resolve('.meteor/packages'), 'utf8');
  return !!meteorPackages.match(/ui\n/);
}
