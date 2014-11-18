
CatalogLoader = function (fromCatalog, toPackageGraph) {
  var self = this;

  this.catalog = fromCatalog;
  this.graph = toPackageGraph;

  // { "package": [versions...] }
  this._versionListCache = {};
};
ConstraintSolver.CatalogLoader = CatalogLoader;

CatalogLoader.prototype._getSortedVersions = function (package) {
  var self = this;
  if (! _.has(self.versionListCache, package)) {
    self.versionListCache[package] = catalog.getSortedVersions(package);
  }
  return self.versionListCache[package];
};

// Takes an array of package name strings.  Loads all versions of them and
// their (strong) dependencies.
CatalogLoader.prototype.loadAllVersionsRecursive = function (packageList) {
  var self = this;

  // Within a call to loadAllVersionsRecursive, we only visit each package
  // at most once.  If you call it multiple times, we will visit packages
  // again and do a little extra work, but we won't necessarily go back to
  // the Catalog.
  var loadQueue = [];
  var packagesEverEnqueued = {};

  var enqueue = function (package) {
    if (! _.has(packagesEverEnqueued, package)) {
      packagesEverEnqueued[package] = true;
      loadQueue.push(package);
    }
  };

  _.each(packageList, enqueue);

  while (loadQueue.length) {
    var package = loadQueue.pop();
    self.loadAllVersions(package);
    _.each(self.graph.getDependencyPackages(package),
           enqueue);
  }
};

// Load all versions of `package` from the Catalog into the PackageGraph,
// unless they are loaded already.  Returns `true` if any new loading
// happens.  Does not recursively load dependencies.
CatalogLoader.prototype.loadAllVersions = function (package) {
  var self = this;

  var loadedAnything = false;
  var versions = self._getSortedVersions(package);
  _.each(versions, function (version) {
    if (! self.graph.hasPackageVersion(package, version)) {
      loadedAnything = (
        loadedAnything ||
          self.loadPackageVersion(package, version));
    }
  });

  return loadedAnything;
};

// Get the dependencies of one "package@version" from the Catalog and
// add them to the PackageGraph (if they aren't already).  Returns
// true if new data was loaded.
CatalogLoader.prototype.loadPackageVersion = function (package, version) {
  var self = this;

  if (self.graph.hasPackageVersion(package, version)) {
    return false;
  }

  var versionDef = self.catalog.getVersion(package, version);
  _.each(versionDef.dependencies, function (catalogDep, package2) {
    // catalogDep is almost in the format we want.  It has `constraint`
    // and `references`, while we want `constraint` and `depArchs`.
    var dep = {};
    if (catalogDep.constraint) {
      // catalogDep may have a falsy `constraint` like `null` or `""` that
      // counts as no constraint, whereas PackageGraph doesn't allow it.
      dep.constraint = catalogDep.constraint;
    }
    var depArchs = _.compact(_.map(catalogDep.references, function (ref) {
      if (ref.weak) {
        return null;
      }
      return ref.arch;
    }));
    if (depArchs.length) {
      dep.depArchs = depArchs;
    }

    self.graph.addDependency(package, version, package2, dep);
  });

  return true;
};
