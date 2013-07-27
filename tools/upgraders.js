var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var project = require('./project.js');

// This upgrader implements two changes made in 0.6.5 as part of the Linker
// project.
//
// First, linker changed how "app packages" (packages in the "packages"
// directory in an app) are treated.  Before 0.6.5, all app packages were
// implicitly "use"d by the app. This meant there was no way to have an app
// package that was intended only to be "use" by the test slices of other app
// packages. In 0.6.5, you have to explicitly "meteor add" app packages to
// .meteor/packages in order for them to be used by your app.  This upgrader
// adds all existing packages found in the packages/ directory to
// .meteor/packages. (If you had such test helpers, you can remove them
// afterwards.)
//
// Second, linker changed how the standard set of packages used by apps is
// included. Instead of being hard-coded into initFromAppDir, the standard
// packages are "implied" by the new "standard-app-packages" package, which is
// explicitly listed in .meteor/packages. So we need to add
// "standard-app-packages" to .meteor/packages when upgrading.
var addAppPackagesAndStandardAppPackages = function (appDir) {
  project.add_package(appDir, 'standard-app-packages');

  var appPackageDir = path.join(appDir, 'packages');
  try {
    var appPackages = fs.readdirSync(appPackageDir);
  } catch (e) {
    if (!(e && e.code === 'ENOENT'))
      throw e;
  }

  _.each(appPackages, function (p) {
    // We can ignore empty directories, etc. Packages have to have a
    // package.js. (In 0.6.5, they can also be built packages with
    // unipackage.json... but that surely is irrelevant for this upgrade.)
    if (fs.existsSync(path.join(appPackageDir, p, 'package.js')))
      project.add_package(appDir, p);
  });
};


var upgradersByName = {
  "app-packages": addAppPackagesAndStandardAppPackages
};

exports.runUpgrader = function (upgraderName, appDir) {
  // This should only be called from the hidden run-upgrader command or by
  // "meteor update" with an upgrader from one of our releases, so it's OK if
  // error handling is just an exception.
  if (! _.has(upgradersByName, upgraderName))
    throw new Error("Unknown upgrader: " + upgraderName);
  upgradersByName[upgraderName](appDir);
};
