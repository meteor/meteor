// Give a sort spec, which can be in any of these forms:
//   {"key1": 1, "key2": -1}
//   [["key1", "asc"], ["key2", "desc"]]
//   ["key1", ["key2", "desc"]]
//
// (.. with the first form being dependent on the key enumeration
// behavior of your javascript VM, which usually does what you mean in
// this case if the key names don't look like integers ..)
//
// return a function that takes two objects, and returns -1 if the
// first object comes first in order, 1 if the second object comes
// first, or 0 if neither object comes before the other.

Sorter = function (spec) {
  var self = this;
  self._sortFunction = null;

  var sortSpecParts = [];

  if (spec instanceof Array) {
    for (var i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i]),
          ascending: true
        });
      } else {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i][0]),
          ascending: spec[i][1] !== "desc"
        });
      }
    }
  } else if (typeof spec === "object") {
    for (var key in spec) {
      sortSpecParts.push({
        lookup: LocalCollection._makeLookupFunction(key),
        ascending: spec[key] >= 0
      });
    }
  } else {
    throw Error("Bad sort specification: ", JSON.stringify(spec));
  }

  // If there are no sorting rules specified, leave _sortFunction as null.  This
  // will allow us to have a special case where we sort on distances if query
  // involved the $near operator.
  if (sortSpecParts.length === 0)
    return;

  // reduceValue takes in all the possible values for the sort key along various
  // branches, and returns the min or max value (according to the bool
  // findMin). Each value can itself be an array, and we look at its values
  // too. (ie, we do a single level of flattening on branchValues, then find the
  // min/max.)
  var reduceValue = function (branchValues, findMin) {
    var reduced;
    var first = true;
    // Iterate over all the values found in all the branches, and if a value is
    // an array itself, iterate over the values in the array separately.
    _.each(branchValues, function (branchValue) {
      // Value not an array? Pretend it is.
      if (!isArray(branchValue))
        branchValue = [branchValue];
      // Value is an empty array? Pretend it was missing, since that's where it
      // should be sorted.
      if (isArray(branchValue) && branchValue.length === 0)
        branchValue = [undefined];
      _.each(branchValue, function (value) {
        // We should get here at least once: lookup functions return non-empty
        // arrays, so the outer loop runs at least once, and we prevented
        // branchValue from being an empty array.
        if (first) {
          reduced = value;
          first = false;
        } else {
          // Compare the value we found to the value we found so far, saving it
          // if it's less (for an ascending sort) or more (for a descending
          // sort).
          var cmp = LocalCollection._f._cmp(reduced, value);
          if ((findMin && cmp > 0) || (!findMin && cmp < 0))
            reduced = value;
        }
      });
    });
    return reduced;
  };

  self._sortFunction = function (a, b) {
    for (var i = 0; i < sortSpecParts.length; ++i) {
      var specPart = sortSpecParts[i];
      var aValue = reduceValue(specPart.lookup(a), specPart.ascending);
      var bValue = reduceValue(specPart.lookup(b), specPart.ascending);
      var compare = LocalCollection._f._cmp(aValue, bValue);
      if (compare !== 0)
        return specPart.ascending ? compare : -compare;
    };
    return 0;
  };
};

Sorter.prototype.getComparator = function (options) {
  var self = this;
  // If there was a sort specification, use it.
  // XXX do we not use distance as a secondary sort key?
  if (self._sortFunction)
    return self._sortFunction;

  // If there was no sort specification and we have no distances, everything is
  // equal.
  if (!options || !options.distances) {
    return function (a, b) {
      return 0;
    };
  }

  var distances = _.clone(options.distances);
  return function (a, b) {
    return distances[a._id] - distances[b._id];
  };
};

MinimongoTest.Sorter = Sorter;
