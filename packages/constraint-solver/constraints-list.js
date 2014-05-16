var mori = Npm.require('mori');
var semver = Npm.require('semver');

////////////////////////////////////////////////////////////////////////////////
// ConstraintsList
////////////////////////////////////////////////////////////////////////////////
// A persistent data-structure that keeps references to Constraint objects
// arranged by the "name" field of Constraint, exact field and version.
ConstraintSolver.ConstraintsList = function (prev) {
  var self = this;

  if (prev) {
    self.byName = prev.byName;
    self.length = prev.length;
  } else {
    self.byName = mori.hash_map();
    self.length = 0;
  }
};

ConstraintSolver.ConstraintsList.prototype.contains = function (c) {
  var self = this;
  if (! mori.has_key(self.byName, c.name))
    return false;

  var bn = mori.get(self.byName, c.name);
  var constraints = mori.get(bn, c.type === "exactly" ? "exact" : "inexact");
  return mori.has_key(constraints, c.version);
};

// returns a new version containing passed constraint
ConstraintSolver.ConstraintsList.prototype.push = function (c) {
  var self = this;

  if (self.contains(c)) {
    return self;
  }

  var newList = new ConstraintSolver.ConstraintsList(self);

  // create a record or update the lookup table
  if (! mori.has_key(self.byName, c.name)) {
    var exactMap = mori.hash_map();
    var inexactMap = mori.hash_map();

    if (c.type === "exactly") {
      exactMap = mori.assoc(exactMap, c.version, c);
    } else {
      inexactMap = mori.assoc(inexactMap, c.version, c);
    }

    var bn = mori.hash_map("exact", exactMap, "inexact", inexactMap);
    newList.byName = mori.assoc(newList.byName, c.name, bn);
  } else {
    var exactStr = c.type === "exactly" ? "exact" : "inexact";

    var bn = mori.get(newList.byName, c.name);
    var constraints = mori.get(bn, exactStr);
    constraints = mori.assoc(constraints, c.version, c);
    bn = mori.assoc(bn, exactStr, constraints);
    newList.byName = mori.assoc(newList.byName, c.name, bn);
  }

  newList.length++;

  return newList;
};

ConstraintSolver.ConstraintsList.prototype.forPackage = function (name, iter) {
  var self = this;
  var forPackage = mori.get(self.byName, name);
  var exact = mori.get(forPackage, "exact");
  var inexact = mori.get(forPackage, "inexact");

  var niter = function (pair) {
    iter(mori.last(pair));
  };

  mori.each(exact, niter);
  mori.each(inexact, niter);
};

// doesn't break on the false return value
ConstraintSolver.ConstraintsList.prototype.each = function (iter) {
  var self = this;
  mori.each(self.byName, function (coll) {
    mori.each(mori.last(coll), function (exactInexactColl) {
      mori.each(mori.last(exactInexactColl), function (c) {
        iter(mori.last(c));
      });
    });
  });
};

// doesn't break on the false return value
ConstraintSolver.ConstraintsList.prototype.eachExact = function (iter) {
  var self = this;
  mori.each(self.byName, function (coll) {
    mori.each(mori.get(coll, "exact"), function (c) {
      iter(mori.last(c));
    });
  });
};

ConstraintSolver.ConstraintsList.prototype.union = function (anotherList) {
  var self = this;
  var newList, oldList;

  if (self.length <= anotherList.length) {
    newList = anotherList;
    oldList = self;
  } else {
    newList = self;
    oldList = anotherList;
  }

  oldList.each(function (c) {
    newList = newList.push(c);
  });

  return newList;
};

// Checks if the passed unit version violates any of the constraints.
// Returns a list of constraints that are violated (empty if the unit
// version does not violate any constraints).
// XXX Returns a regular array, not a ConstraintsList.
ConstraintSolver.ConstraintsList.prototype.violatedConstraints = function (uv) {
  var self = this;

  var violated = [];

  self.forPackage(uv.name, function (c) {
    if (! c.isSatisfied(uv)) {
      violated.push(c);
    }
  });

  return violated;
};

// XXX Returns a regular array, not a ConstraintsList.
ConstraintSolver.ConstraintsList.prototype.constraintsForPackage = function (p) {
  var self = this;

  var constraints = [];

  self.forPackage(p, function (c) {
    constraints.push(c);
  });

  return constraints;
};


// a weird method that returns a list of exact constraints those correspond to
// the dependencies in the passed list
ConstraintSolver.ConstraintsList.prototype.exactDependenciesIntersection =
  function (deps) {
  var self = this;
  var newList = new ConstraintSolver.ConstraintsList();

  self.eachExact(function (c) {
    if (deps.contains(c.name))
      newList = newList.push(c);
  });

  return newList;
};

// Finds the earliest and latest versions of package `dep` in `resolver` that
// matches this list of constraints.
// The feature is: it runs in linear time of all constraints for given package
// and linear time of all uvs for the package:
// O(|constraintsForDep| + |uvsOfDep|)
ConstraintSolver.ConstraintsList.prototype.edgeMatchingVersionsFor =
  function (dep, resolver) {
  var self = this;

  // earliest, latest and exact constraints found
  var earliest = null;
  var latest = null;
  var exact = null;
  var greatestAtLeast = null;

  self.forPackage(dep, function (c) {
    if (c.type === "exactly")
      exact = c;
    if (exact)
      return;

    if (c.type === "at-least") {
      if (! greatestAtLeast || semver.lt(greatestAtLeast.version, c.version))
        greatestAtLeast = c;
      return;
    }

    if (! earliest || semver.lt(c.version, earliest.version))
      earliest = c;
    if (! latest || semver.gt(c.version, latest.version))
      latest = c;
  });

  // there is some exact constraint, the choice is obvious
  if (exact) {
    var uv = exact.getSatisfyingUnitVersion(resolver);
    if (_.isEmpty(self.violatedConstraints(uv)))
      return { earliest: uv, latest: uv };
    else
      return { earliest: null, latest: null };
  }

  var earliestUv = null;
  var latestUv = null;

  // The range of constraints is consistent and can have some matching uvs if
  // uvs corresponding to both earliest and latest constraints have the same ecv
  if (! earliest ||
      earliest.getSatisfyingUnitVersion(resolver).earliestCompatibleVersion
    === latest.getSatisfyingUnitVersion(resolver).earliestCompatibleVersion) {
    _.each(resolver.unitsVersions[dep], function (uv) {
      if (earliest && latest)
        if (! earliest.isSatisfied(uv) || ! latest.isSatisfied(uv))
          return;
      // return if one of the >= constraints is not satisfied
      if (greatestAtLeast && ! greatestAtLeast.isSatisfied(uv))
        return;
      if (! earliestUv || semver.lt(uv.version, earliestUv.version))
        earliestUv = uv;
      if (! latestUv || semver.gt(uv.version, latestUv.version))
        latestUv = uv;
    });
  }

  return { earliest: earliestUv, latest: latestUv };
};

ConstraintSolver.ConstraintsList.prototype.earliestMatchingVersionFor =
  function (dep, resolver) {
  return this.edgeMatchingVersionsFor(dep, resolver).earliest;
};

ConstraintSolver.ConstraintsList.prototype.latestMatchingVersionFor =
  function (dep, resolver) {
  return this.edgeMatchingVersionsFor(dep, resolver).latest;
};

ConstraintSolver.ConstraintsList.prototype.toString = function (simple) {
  var self = this;
  var str = "";

  var strs = [];

  self.each(function (c) {
    strs.push(c.toString());
  });

  strs.sort();

  _.each(strs, function (c) {
    if (str !== "") {
      str += simple ? " " : ", ";
    }
    str += c;
  });

  return simple ? str : "<constraints list: " + str + ">";
};

ConstraintSolver.ConstraintsList.prototype.toArray = function () {
  var self = this;
  var arr = [];
  self.each(function (c) {
    arr.push(c);
  });

  return arr;
};

ConstraintSolver.ConstraintsList.fromArray = function (arr) {
  var list = new ConstraintSolver.ConstraintsList();
  _.each(arr, function (c) {
    list = list.push(c);
  });

  return list;
};
