Minimongo.Sorter.prototype.combineIntoProjection = function (projection) {
  var self = this;
  var specPaths = Minimongo._pathsElidingNumericKeys(self._getPaths());
  return combineImportantPathsIntoProjection(specPaths, projection);
};
