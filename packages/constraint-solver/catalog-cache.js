var CS = ConstraintSolver;
var PV = PackageVersion;

var pvkey = function (package, version) {
  return package + " " + version;
};

// Stores the Dependencies for each known PackageAndVersion.
CS.CatalogCache = function () {
  // String(PackageAndVersion) -> String -> Dependency.
  // For example, "foo 1.0.0" -> "bar" -> Dependency.fromString("?bar@1.0.2").
  this._dependencies = {};
  // A map derived from the keys of _dependencies, for ease of iteration.
  // "foo" -> ["1.0.0", ...]
  // Versions in the array are unique but not sorted, unless the `.sorted`
  // property is set on the array.  The array is never empty.
  this._versions = {};
};

CS.CatalogCache.prototype.hasPackageVersion = function (package, version) {
  return _.has(this._dependencies, pvkey(package, version));
};

CS.CatalogCache.prototype.addPackageVersion = function (p, v, deps) {
  check(p, String);
  check(v, String);
  // `deps` must not have any duplicate values of `.packageConstraint.package`
  check(deps, [CS.Dependency]);

  var key = pvkey(p, v);
  if (_.has(this._dependencies, key)) {
    throw new Error("Already have an entry for " + key);
  }

  if (! _.has(this._versions, p)) {
    this._versions[p] = [];
  }
  this._versions[p].push(v);
  this._versions[p].sorted = false;

  var depsByPackage = {};
  this._dependencies[key] = depsByPackage;
  _.each(deps, function (d) {
    var p2 = d.packageConstraint.package;
    if (_.has(depsByPackage, p2)) {
      throw new Error("Can't have two dependencies on " + p2 +
                      " in " + key);
    }
    depsByPackage[p2] = d;
  });
};

// Returns the dependencies of a (package, version), stored in a map.
// The values are Dependency objects; the key for `d` is
// `d.packageConstraint.package`.  (Don't mutate the map.)
CS.CatalogCache.prototype.getDependencyMap = function (p, v) {
  var key = pvkey(p, v);
  if (! _.has(this._dependencies, key)) {
    throw new Error("No entry for " + key);
  }
  return this._dependencies[key];
};

// Returns an array of version strings, sorted, possibly empty.
// (Don't mutate the result.)
CS.CatalogCache.prototype.getPackageVersions = function (package) {
  var result = (_.has(this._versions, package) ?
                this._versions[package] : []);
  if ((!result.length) || result.sorted) {
    return result;
  } else {
    // sort in place, and record so that we don't sort redundantly
    // (we'll sort again if more versions are pushed onto the array)
    result.sort(PV.compare);
    result.sorted = true;
    return result;
  }
};

CS.CatalogCache.prototype.hasPackage = function (package) {
  return _.has(this._versions, package);
};

CS.CatalogCache.prototype.toJSONable = function () {
  var self = this;
  var data = {};
  _.each(self._dependencies, function (depsByPackage, key) {
    // depsByPackage is a map of String -> Dependency.
    // Map over the values to get an array of String.
    data[key] = _.map(depsByPackage, function (dep) {
      return dep.toString();
    });
  });
  return { data: data };
};

CS.CatalogCache.fromJSONable = function (obj) {
  check(obj, { data: Object });

  var cache = new CS.CatalogCache();
  _.each(obj.data, function (depsArray, pv) {
    check(depsArray, [String]);
    pv = CS.PackageAndVersion.fromString(pv);
    cache.addPackageVersion(
      pv.package, pv.version,
      _.map(depsArray, function (str) {
        return CS.Dependency.fromString(str);
      }));
  });
  return cache;
};

// Calls `iter` on each PackageAndVersion, with the second argument being
// a map from package name to Dependency.  If `iter` returns true,
// iteration is stopped.  There's no particular order to the iteration.
CS.CatalogCache.prototype.eachPackageVersion = function (iter) {
  var self = this;
  _.find(self._dependencies, function (value, key) {
    var stop = iter(CS.PackageAndVersion.fromString(key), value);
    return stop;
  });
};

// Calls `iter` on each package name, with the second argument being
// a list of versions present for that package (unique and sorted).
// If `iter` returns true, iteration is stopped.
ConstraintSolver.CatalogCache.prototype.eachPackage = function (iter) {
  var self = this;
  _.find(_.keys(self._versions), function (key) {
    var stop = iter(key, self.getPackageVersions(key));
    return stop;
  });
};
