
// A PackageGraph is a subset of the catalog's dependency graph,
// stored in a concise way that can easily be dumped to JSON or loaded
// from JSON.  Package information is loaded from the catalog into a
// PackageGraph, which is used to generate input for the constraint
// solver.

PackageGraph = function (data) {
  var self = this;

  // `{ "package@version": { "package2": {
  //  (constraint: "=1.1.2 || 2.0.0"), (depArchs: ["os", ...]) } }`
  // Must have either a constraint or depArchs, or both.
  // A constraint without depArchs is a weak dependency; it does not
  // require package2, but constrains what versions can be selected
  // if it is present.
  self.data = (data || {});

  // derived from the keys of `this.data`:
  self._packageVersions = {}; // { "package": { "version": true } }

  // populate `self._packageVersions` from initial `data`
  _.each(_.keys(self.data), function (packageAtVersion) {
    var pv = parsePackageAtVersion(packageAtVersion);
    self._ensurePackageVersion(pv.package, pv.version, true /*_force*/);
  });

  self._checkRep();
};

ConstraintSolver.PackageGraph = PackageGraph;

PackageGraph.prototype._checkRep = function () {
  var self = this;
  var data = self.data;

  check(data, Object);

  _.each(data, function (dependencies, packageAtVersion) {
    var pv = parsePackageAtVersion(packageAtVersion);
    if (! (_.has(self._packageVersions, pv.package) &&
           self._packageVersions[pv.package][pv.version] === true)) {
      throw new Error("Representation violation: No entry in " +
                      "_packageVersions for " + packageAtVersion);
    }
    check(dependencies, Object);
    _.each(dependencies, function (dep, package2) {
      if (package2.indexOf('@') >= 0) {
        throw new Error('package name "' + package2 + '" can\'t have an @');
      }
      self._checkDependency(dep);
    });
  });

  // We could also check that all package names, versions, and constraints
  // are strings of the right form (by parsing them), but we don't.
};

PackageGraph.prototype._checkDependency = function (dep) {
  check(dep, { constraint: Match.Optional(String),
               depArchs: Match.Optional([String]) });
  if (! (dep.constraint || dep.depArchs)) {
    throw new Error("Must have one of 'constraint' or 'depArchs'");
  }
  if (dep.depArchs && ! dep.depArchs.length) {
    throw new Error("If 'depArchs' is given, it must have at least " +
                    "one element");
  }
};

var packageAtVersion = function (package, version) {
  return package + '@' + version;
};
var parsePackageAtVersion = function (packageAtVersion) {
  var parts = packageAtVersion.split('@');
  if (parts.length !== 2) {
    throw new Error('"' + packageAtVersion + '" is not of the form ' +
                    'package@version');
  }
  return { package: parts[0], version: parts[1] };
};

// _force is internal to PackageGraph.  It's used to populate
// `self._packageVersions` even if the package@version already
// exists in self.data.
PackageGraph.prototype._ensurePackageVersion = function (package, version, _force) {
  var self = this;
  var data = self.data;
  var key = packageAtVersion(package, version);
  if ((! data[key]) || _force) {
    if (! _.has(self._packageVersions, package)) {
      self._packageVersions[package] = {};
    }
    self._packageVersions[package][version] = true;
  }
  if (! data[key]) {
    data[key] = {};
    return true;
  }
  return false;
};

// Add a package@version to the universe of package version.  Idempotent.
// Returns true if the version if new.
PackageGraph.prototype.addPackageVersion = function (package, version) {
  var data = this.data;
  var key = packageAtVersion(package, version);
  if (! data[key]) {
    data[key] = {};
    return true;
  }
  return false;
};

// If there is already a dependency for (package@version, package2), this one
// must match it exactly, or an error will be thrown.  Returns true if the
// dependency is new.
PackageGraph.prototype.addDependency = function (package, version, package2, dep) {
  var self = this;
  var data = self.data;
  var key = packageAtVersion(package, version);
  if (! data[key]) {
    data[key] = {};
  }
  var dependencies = data[key];

  self._checkDependency(dep);

  if (_.has(dependencies, package2)) {
    if (! _.isEqual(dependencies[package2], dep)) {
      throw new Error("Can't add a different dependency record for " +
                      package + "@" + version + "->" + package2 + "; OLD: " +
                      JSON.stringify(dependencies[package2]) + ", NEW: " +
                      JSON.stringify(dep));
    }
    return false;
  } else {
    dependencies[package2] = dep;
    return true;
  }
};

// Returns a map from package name to { constraint, depArchs } object
// for all the packages that are dependencies of this package@version.
// At least one of `constraint` or `depArchs` is set.  If `constraint`
// is set, it is truthy, and if `depArchs` is set, it is a non-empty
// array of strings.
//
// Don't mutate the returned object.
PackageGraph.prototype.getDependencies = function (package, version) {
  var self = this;
  if (! self.hasPackageVersion(package, version)) {
    throw new Error("We don't have " + package + "@" + version +
                    " in the PackageGraph");
  }
  return self.data[packageAtVersion(package, version)];
};

// Returns the PackageGraph's underlying data, without copying it.
//
// The data can be serialized with JSON.stringify, and you create
// a new PackageGraph by calling the constructor on the parsed JSON.
// Don't mutate the data, and don't use it to construct another
// PackageGraph unless you clone the data first (such as by using
// stringify and parse).
PackageGraph.prototype.getData = function () {
  return this.data;
};

PackageGraph.prototype.hasPackageVersion = function (package, version) {
  return _.has(this.data, packageAtVersion(package, version));
};

// The array returned is not necessarily in sorted order.
PackageGraph.prototype.getPackageVersions = function (package) {
  var self = this;
  if (! _.has(self._packageVersions, package)) {
    return [];
  } else {
    return _.keys(self._packageVersions[package]);
  }
};

// Returns an array of the names of all packages that have at least one
// version in the graph.  The array is not sorted.
PackageGraph.prototype.getPackages = function () {
  return _.keys(this._packageVersions);
};

PackageGraph.prototype.getDependencyPackages = function (package, version) {
  return _.keys(this.getDependencies(package, version));
};
