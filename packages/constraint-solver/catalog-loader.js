var PV = PackageVersion;
var CS = ConstraintSolver;

// A CatalogLoader populates the CatalogCache from the Catalog.  When
// running unit tests with no Catalog and canned data for the
// CatalogCache, there will be no CatalogLoader.
//
// Fine-grained Loading: While we don't currently support loading only
// some versions of a package, CatalogLoader is meant to be extended
// to support incrementally loading individual package versions.  It
// has no concept of a "loaded package," for example, just a loaded
// package version.  CatalogLoader's job, in principle, is to load
// package versions efficiently, no matter the access pattern, by
// making the right catalog calls and doing the right caching.
// Calling a catalog method generally means running a SQLite query,
// which could be time-consuming.

CS.CatalogLoader = function (fromCatalog, toCatalogCache) {
  var self = this;

  self.catalog = fromCatalog;
  self.catalogCache = toCatalogCache;

  self._sortedVersionRecordsCache = {};
};

// We rely on the following `catalog` methods:
//
// * getSortedVersionRecords(packageName) ->
//     [{packageName, version, dependencies}]
//
//   Where `dependencies` is a map from packageName to
//   an object of the form `{ constraint: String|null,
//   references: [{arch: String, optional "weak": true}] }`.

var convertDeps = function (catalogDeps) {
  return _.map(catalogDeps, function (dep, pkg) {
    // The dependency is strong if any of its "references"
    // (for different architectures) are strong.
    var isStrong = _.any(dep.references, function (ref) {
      return !ref.weak;
    });

    var constraint = (dep.constraint || null);

    return new CS.Dependency(new PV.PackageConstraint(pkg, constraint),
                             isStrong ? null : {isWeak: true});
  });
};

// Since we don't fetch different versions of a package independently
// at the moment, this helper is where we get our data.
CS.CatalogLoader.prototype._getSortedVersionRecords = function (pkg) {
  if (! _.has(this._sortedVersionRecordsCache, pkg)) {
    this._sortedVersionRecordsCache[pkg] =
      this.catalog.getSortedVersionRecords(pkg);
  }

  return this._sortedVersionRecordsCache[pkg];
};

CS.CatalogLoader.prototype.loadAllVersions = function (pkg) {
  var self = this;
  var cache = self.catalogCache;
  var versionRecs = self._getSortedVersionRecords(pkg);
  _.each(versionRecs, function (rec) {
    var version = rec.version;
    if (! cache.hasPackageVersion(pkg, version)) {
      var deps = convertDeps(rec.dependencies);
      cache.addPackageVersion(pkg, version, deps);
    }
  });
};

// Takes an array of package names.  Loads all versions of them and their
// (strong) dependencies.
CS.CatalogLoader.prototype.loadAllVersionsRecursive = function (packageList) {
  var self = this;

  // Within a call to loadAllVersionsRecursive, we only visit each package
  // at most once.  If we visit a package we've already loaded, it will
  // lead to a quick scan through the versions in our cache to make sure
  // they have been loaded into the CatalogCache.
  var loadQueue = [];
  var packagesEverEnqueued = {};

  var enqueue = function (pkg) {
    if (! _.has(packagesEverEnqueued, pkg)) {
      packagesEverEnqueued[pkg] = true;
      loadQueue.push(pkg);
    }
  };

  _.each(packageList, enqueue);

  while (loadQueue.length) {
    var pkg = loadQueue.pop();
    self.loadAllVersions(pkg);
    _.each(self.catalogCache.getPackageVersions(pkg), function (v) {
      var depMap = self.catalogCache.getDependencyMap(pkg, v);
      _.each(depMap, function (dep, package2) {
        enqueue(package2);
      });
    });
  }
};
