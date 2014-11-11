var _ = require('underscore');

var archinfo = require('./archinfo.js');

// Given an array of package names, returns an array of all package names
// reachable from it for a given arch (ignoring weak dependencies).
exports.getTransitiveClosureOfPackages = function (rootPackageNames,
                                                   arch, packageMap) {
  var usedPackages = {};  // Map from package name to true;
  var depArch = archinfo.withoutSpecificOs(arch);

  var addToUsed = function (packageName) {
    if (_.has(usedPackages, packageName))
      return;
    usedPackages[packageName] = true;

    var versionRecord = packageMap.getVersionCatalogRecord(packageName);
    // Look at every use and imply for this arch.
    _.each(versionRecord.dependencies, function (dep, depName) {
      _.each(dep.references, function (ref) {
        // We only care about dependencies for our arch (which is normalized to
        // not mention a specific OS).
        if (ref.arch !== depArch)
          return;
        // We don't care about weak dependencies
        if (ref.weak)
          return;
        addToUsed(depName);
      });
    });
  };
  _.each(rootPackageNames, addToUsed);
  return _.keys(usedPackages);
};
