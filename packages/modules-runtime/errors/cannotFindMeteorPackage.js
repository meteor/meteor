/**
 * @description Default error message for when a package is not found
 * @param id{string}
 * @return {Error}
 */
cannotFindMeteorPackage = function(id) {
  var parts = id.split('/');
  var packageName = parts[1];

  // When the id points at a sub-module of an installed package
  // (e.g. "meteor/mongo/x"), the package itself exists but the requested
  // module does not. Reporting a missing package there is misleading (and
  // suggesting "meteor add <core-package>" is nonsensical), so report the
  // missing module instead.
  if (parts.length > 2 &&
      typeof Package === 'object' &&
      Package !== null &&
      Package[packageName]) {
    return new Error(
      'Cannot find module "' + id + '". ' +
      'The package "' + packageName + '" is installed but does not ' +
      'provide that module.'
    );
  }

  return new Error(
    'Cannot find package "' + packageName + '". ' +
    'Try "meteor add ' + packageName + '".'
  );
};
