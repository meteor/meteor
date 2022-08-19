/**
 * @description Default error message for when a package is not found
 * @param id{string}
 * @return {Error}
 */
cannotFindMeteorPackage = function(id) {
  var packageName = id.split('/', 2)[1];
  return new Error(
    'Cannot find package "' + packageName + '". ' +
    'Try "meteor add ' + packageName + '".'
  );
};
