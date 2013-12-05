// Knows how to combine a mongo selector and a fields projection to a new fields
// projection taking into account active fields from the passed selector.
// @returns Object - projection object (same as fields option of mongo cursor)
LocalCollection._combineSelectorAndProjection = function (selector, projection)
{
  var selectorPaths = getPathsWithoutNumericKeys(selector);

  // Special case for $where operator in the selector - projection should depend
  // on all fields of the document. getSelectorPaths returns a list of paths
  // selector depends on. If one of the paths is '' (empty string) representing
  // the root or the whole document, complete projection should be returned.
  if (_.contains(selectorPaths, ''))
    return {};

  var prjDetails = projectionDetails(projection);
  var tree = prjDetails.tree;
  var mergedProjection = {};

  // merge the paths to include
  tree = pathsToTree(selectorPaths,
                     function (path) { return true; },
                     function (node, path, fullPath) { return true; },
                     tree);
  mergedProjection = treeToPaths(tree);
  if (prjDetails.including) {
    // both selector and projection are pointing on fields to include
    // so we can just return the merged tree
    return mergedProjection;
  } else {
    // selector is pointing at fields to include
    // projection is pointing at fields to exclude
    // make sure we don't exclude important paths
    var mergedExclProjection = {};
    _.each(mergedProjection, function (incl, path) {
      if (!incl)
        mergedExclProjection[path] = false;
    });

    return mergedExclProjection;
  }
};

// Returns a set of key paths similar to
// { 'foo.bar': 1, 'a.b.c': 1 }
var treeToPaths = function (tree, prefix) {
  prefix = prefix || '';
  var result = {};

  _.each(tree, function (val, key) {
    if (_.isObject(val))
      _.extend(result, treeToPaths(val, prefix + key + '.'));
    else
      result[prefix + key] = val;
  });

  return result;
};

