
// A PackageGraph is a subset of the catalog's dependency graph,
// stored in a concise way that can easily be dumped to JSON or loaded
// from JSON.  Package information is loaded from the catalog into a
// PackageGraph, which is used to generate input for the constraint
// solver.

PackageGraph = function (data) {
  // `{ "package@version": { "package2": {
  //  (constraint: "=1.1.2 || 2.0"), (depArchs: ["os", ...]) } }`
  // Must have either a constraint or depArchs, or both.
  // A constraint without depArchs is a weak dependency; it does not
  // require package2, but constrains what versions can be selected
  // if it is present.
  this.data = (data || {});

  this._checkRep();
};

ConstraintSolver.PackageGraph = PackageGraph;

PackageGraph.prototype._checkRep = function () {
  var self = this;
  var data = self.data;

  check(data, Object);

  _.each(data, function (dependencies, packageAtVersion) {
    if (packageAtVersion.indexOf('@') < 0) {
      throw new Error('"' + packageAtVersion + '" is not of the form ' +
                      'package@version');
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
};

var packageAtVersion = function (package, version) {
  return package + '@' + version;
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
