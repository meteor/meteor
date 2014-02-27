Sorter.combineSpecIntoProjection = function (spec, projection) {
  var self = this;
  var specPaths = getSortSpecPaths(spec);

  return combineImportantPathsIntoProjection(specPaths, projection);
};

var getSortSpecPaths = function (spec) {
  if (_.isArray(spec))
    return _.map(spec, function (fieldSpec) {
      return _.isArray(fieldSpec) ? fieldSpec[0] : fieldSpec;
    });

  if (_.isObject(spec))
    return _.keys(spec);

  throw new Error("Bad sort specification: " + JSON.stringify(spec));
};

