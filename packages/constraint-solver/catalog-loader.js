const has = Npm.require('lodash.has');

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
  return Object.entries(catalogDeps).map(function ([pkg, dep], ) {
    // The dependency is strong if any of its "references"
    // (for different architectures) are strong.
    var isStrong = dep.references.some(function (ref) {
      return !ref.weak;
    });

    var constraint = (dep.constraint || null);

    return new CS.Dependency(new PV.PackageConstraint(pkg, constraint),
                             isStrong ? null : {isWeak: true});
  });
};

// Since we don't fetch different versions of a package independently
// at the moment, this helper is where we get our data.
CS.CatalogLoader.prototype._getSortedVersionRecords = async function (pkg) {
  if (!has(this._sortedVersionRecordsCache, pkg)) {
    this._sortedVersionRecordsCache[pkg] =
      await this.catalog.getSortedVersionRecords(pkg);
  }

  return this._sortedVersionRecordsCache[pkg];
};

CS.CatalogLoader.prototype.loadSingleVersion = async function (pkg, version) {
  var self = this;
  var cache = self.catalogCache;
  if (! cache.hasPackageVersion(pkg, version)) {
    var rec;
    if (has(self._sortedVersionRecordsCache, pkg)) {
      rec = self._sortedVersionRecordsCache[pkg].find(
                   function (r) {
                     return r.version === version;
                   });
    } else {
      rec = await self.catalog.getVersion(pkg, version);
    }
    if (rec) {
      var deps = convertDeps(rec.dependencies);
      cache.addPackageVersion(pkg, version, deps);
    }
  }
};

CS.CatalogLoader.prototype.loadAllVersions = async function (pkg) {
  var self = this;
  var cache = self.catalogCache;
  var versionRecs = await self._getSortedVersionRecords(pkg);
  versionRecs.forEach(function (rec) {
    var version = rec.version;
    if (! cache.hasPackageVersion(pkg, version)) {
      var deps = convertDeps(rec.dependencies);
      cache.addPackageVersion(pkg, version, deps);
    }
  });
};

// Takes an array of package names.  Loads all versions of them and their
// (strong) dependencies.
CS.CatalogLoader.prototype.loadAllVersionsRecursive = async function (packageList) {
  var self = this;

  // Within a call to loadAllVersionsRecursive, we only visit each package
  // at most once.  If we visit a package we've already loaded, it will
  // lead to a quick scan through the versions in our cache to make sure
  // they have been loaded into the CatalogCache.
  var loadQueue = [];
  var packagesEverEnqueued = {};

  var enqueue = function (pkg) {
    if (!has(packagesEverEnqueued, pkg)) {
      packagesEverEnqueued[pkg] = true;
      loadQueue.push(pkg);
    }
  };

  packageList.forEach(enqueue);

  while (loadQueue.length) {
    var pkg = loadQueue.pop();
    await self.loadAllVersions(pkg);
    self.catalogCache.getPackageVersions(pkg).forEach(function (v) {
      var depMap = self.catalogCache.getDependencyMap(pkg, v);
      Object.entries(depMap).forEach(function ([package2, dep]) {
        enqueue(package2);
      });
    });
  }
};
