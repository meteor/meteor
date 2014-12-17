
// A CatalogLoader populates the CatalogCache from the Catalog.  When
// running unit tests with no Catalog and canned data for the
// CatalogCache, there will be no CatalogLoader.
//
// The CatalogLoader is written with incremental loading in mind.  You
// might load only some versions of some packages, and then at some
// later point, load more versions.  Because of this, there's no list
// of "loaded packages."  However, we cache the catalog's list of
// all versions of each package, so we can easily check whether a
// package is fully loaded or not (and ensure that it is fully loaded
// without even going to the catalog in the case that it is).

ConstraintSolver.CatalogLoader = function (fromCatalog, toCatalogCache) {
  var self = this;

  self.catalog = fromCatalog;
  self.catalogCache = toCatalogCache;

  // Cache of the result of catalog.getSortedVersions.
  // { "package": [versions...] }
  self._versionListCache = {};
};
CatalogLoader = ConstraintSolver.CatalogLoader;

// Note that `catalog` has the following methods that we rely on:
//
// * getSortedVersions(packageName) -> [String]
// * getVersion(packageName, version) -> {
//     packageName, version, dependencies }
//
// Where `dependencies` is a map from packageName to
// an object of the form `{ constraint: String,
// references: [{arch: String, optional "weak": true}] }`.

CatalogLoader.prototype._getSortedVersions = function (package) {
  var self = this;
  if (! _.has(self._versionListCache, package)) {
    self._versionListCache[package] =
      self.catalog.getSortedVersions(package);
    var xxx = self._versionListCache[package];
    self._versionListCache[package] =
      _.flatten(_.map(_.values(_.groupBy(xxx, function (v) { return v.charAt(0); })),
                      function(array) { return array.slice(-4); }));
    // XXXXXX
  }
  return self._versionListCache[package];
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
    _.each(self.catalogCache.getPackageVersions(package), function (v) {
      var depMap = self.catalogCache.getDependencyMap(package, v);
      _.each(depMap, function (dep, package2) {
        enqueue(package2);
      });
    });
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
    if (! self.catalogCache.hasPackageVersion(package, version)) {
      var loadedThis = self.loadPackageVersion(package, version);
      loadedAnything = (loadedAnything || loadedThis);
    }
  });

  return loadedAnything;
};

// Get the dependencies of one "package@version" from the Catalog and
// add them to the PackageGraph (if they aren't already).  Returns
// true if new data was loaded.
CatalogLoader.prototype.loadPackageVersion = function (package, version) {
  var self = this;

  if (self.catalogCache.hasPackageVersion(package, version)) {
    return false;
  }

  var versionDef = self.catalog.getVersion(package, version);

  var depsArray = []; // array of Dependency objects

  _.each(versionDef.dependencies, function (catalogDep, package2) {
      // `catalogDep` contains a list of references, which describes
      // which unibuilds of this unitVersion depend on depName, as
      // well as a constraint, which constraints the versions it
      // depends on.

      // The package->package dependency is weak if ALL of the underlying
      // unibuild->unibuild dependencies are weak.  ie,
      //     api.use('dep', 'server', { weak: true });
      //     api.use('dep', 'client');
      // is not weak at the package->package level.
      var isStrong = _.any(catalogDep.references, function (ref) {
        return !ref.weak;
      });

      var constraint = (catalogDep.constraint || null);
      if (constraint === 'none') {
        // (note: I'm not sure why we need to recognize "none")
        constraint = null;
      }

    depsArray.push(new Dependency(package2, constraint,
                                  isStrong ? null : { weak: true }));
  });

  self.catalogCache.addPackageVersion(package, version, depsArray);

  return true;
};
