Package.describe({
  summary: "Role-based authorization"
});

Package.on_use(function (api) {
  var both = ['client', 'server'];
  api.use(['underscore', 'accounts-base'], both);
  api.use(['handlebars'], 'client', {weak: true});

  console.log('roles package loaded')
  // This is needed due to Meteor Issue #1358
  //   https://github.com/meteor/meteor/issues/1358
  // The 'weak' flag doesn't work with packages that aren't 
  // in meteor's internal cache (ie. non-core packages)
  if(uiExists()) {
    console.log('ui exists')
    api.use(['ui'], 'client', {weak: true});
  } else {
    console.log('ui does not exist')
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
  var fs = Npm.require('fs'),
      path = Npm.require('path'),
      meteorPackages = fs.readFileSync(path.resolve('.meteor/packages'), 'utf8');

  if (!meteorPackages) {
    return false;
  }

  console.log(meteorPackages);

  if (/^\s*ui\s*$/m.test(meteorPackages)) {
    // definitely there
    return true;
  }

  if (/^\s*standard-app-packages\s*$/m.test(meteorPackages)) {
    // _may_ be there.  have to check for actual package since
    // releases before 0.8.0 had standard-app-packages but not
    // ui
    // 
    // local dev package location:
    //   ".meteor/local/build/programs/client/packages"
    // bundled package location:
    //   ??
  }

  return false;
}
