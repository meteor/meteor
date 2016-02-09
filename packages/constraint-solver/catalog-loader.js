var PV = PackageVersion;
var CS = ConstraintSolver;

// A CatalogLoader does the work of populating a CatalogCache from the
// Catalog.  When you run a unit test with canned Catalog data, there is
// a CatalogCache but no CatalogLoader.
//
// CatalogLoader acts as a minor cache layer between CatalogCache and
// the Catalog, because going to the Catalog generally means going to
// SQLite, i.e. disk, while caching a version in the CatalogCache means
// that it is available to the solver.  CatalogLoader's private cache
// allows it to over-read from the Catalog so that it can mediate
// between the granularity provided by the Catalog and the versions
// requested by the solver.
//
// We rely on the following `catalog` methods:
//
// * getSortedVersionRecords(packageName) ->
//     [{packageName, version, dependencies}]
//
//   Where `dependencies` is a map from packageName to
//   an object of the form `{ constraint: String|null,
//   references: [{arch: String, optional "weak": true}] }`.
//
// * getVersion(packageName, version) ->
//   {packageName, version, dependencies}

CS.CatalogLoader = function (fromCatalog, toCatalogCache) {
  var self = this;

  self.catalog = fromCatalog;
  self.catalogCache = toCatalogCache;

  self._sortedVersionRecordsCache = {};
};

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

CS.CatalogLoader.prototype.loadSingleVersion = function (pkg, version) {
  var self = this;
  var cache = self.catalogCache;
  if (! cache.hasPackageVersion(pkg, version)) {
    var rec;
    if (_.has(self._sortedVersionRecordsCache, pkg)) {
      rec = _.find(self._sortedVersionRecordsCache[pkg],
                   function (r) {
                     return r.version === version;
                   });
    } else {
      rec = self.catalog.getVersion(pkg, version);
    }
    if (rec) {
      var deps = convertDeps(rec.dependencies);
      cache.addPackageVersion(pkg, version, deps);
    }
  }
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
