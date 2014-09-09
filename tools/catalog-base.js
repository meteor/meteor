var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var Unipackage = require('./unipackage.js').Unipackage;
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var watch = require('./watch.js');
var files = require('./files.js');
var utils = require('./utils.js');
var packageVersionParser = require('./package-version-parser.js');

var baseCatalog = exports;

var catalog = require('./catalog.js');

// This is a basic catalog class. It accesses basic catalog data by looking
// through the catalog's collections.
//
// YOU MUST SET self.initialized = true BEFORE USING THIS CATALOG. In fact, the
// protolog is not even intended to be used by itself -- there is a server
// catalog and a constraint solving catalog, which inherit from it.
baseCatalog.BaseCatalog = function () {
  var self = this;

  // Package server data. Mostly arrays of objects.
  self.packages = null;
  self.versions = null;  // package name -> version -> object
  self.builds = null;

  // We use the initialization design pattern because it makes it easier to use
  // both of our catalogs as singletons.
  self.initialized = false;

};

_.extend(baseCatalog.BaseCatalog.prototype, {
  // Set all the collections to their initial values, which are mostly
  // blank. This does not set self.initialized -- do that manually in the child
  // class when applicable.
  reset: function () {
    var self = this;

    // Initialize everything to its default version.
    self.packages = [];
    self.versions = {};
    self.builds = [];
  },

  // Throw if the catalog's self.initialized value has not been set to true.
  _requireInitialized: function () {
    var self = this;

    if (! self.initialized)
      throw new Error("catalog not initialized yet?");
  },

  // serverPackageData is a description of the packages available from
  // the package server, as returned by
  // packageClient.loadPackageData. Add all of those packages to the
  // catalog without checking for duplicates.
  _insertServerPackages: function (serverPackageData) {
    var self = this;

    var collections = serverPackageData.collections;

    if (!collections)
      return;

    _.each(
      ['packages', 'builds'],
      function (field) {
        self[field].push.apply(self[field], collections[field]);
      });

    // Convert versions from array format to nested object format.
    _.each(collections.versions, function (record) {
      if (!_.has(self.versions, record.packageName)) {
        self.versions[record.packageName] = {};
      }
      self.versions[record.packageName][record.version] = record;
    });
  },

  // Accessor methods below. The primary function of both catalogs is to provide
  // data about the existence of various packages, versions, etc, which it does
  // through these methods.

  // We have a pattern, where we try to retrieve something and if we fail, call
  // refresh to check if there is new data. That makes sense to me, so let's do
  // that all the time. (In the future, we should continue some rate-limiting
  // on refresh, but for now, most of the time, refreshing on an unknown <stuff>
  // will just cause us to crash if it doesn't exist, so we are just delaying
  // the inevitable rather than slowing down normal operations)
  _recordOrRefresh: function (recordFinder) {
    var self = this;
    buildmessage.assertInCapture();
    var record = recordFinder();
    // If we cannot find it maybe refresh.
    if (!record && self._refreshingIsProductive()) {
      if (! catalog.official.refreshInProgress()) {
        catalog.official.refresh();
      }
      record = recordFinder();
    }
    // If we still cannot find it, give the user a null.
    if (!record) {
      return null;
    }
    return record;
  },

  _refreshingIsProductive: function () {
    // Refreshing is productive for catalog.official and catalog.complete only.
    return false;
  },

  // Return an array with the names of all of the packages that we
  // know about, in no particular order.
  getAllPackageNames: function () {
    var self = this;
    self._requireInitialized();

    return _.pluck(self.packages, 'name');
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name, options) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();
    options = options || {};

    var get = function () {
      return _.findWhere(self.packages, { name: name });
    };

    return options.noRefresh ? get() : self._recordOrRefresh(get);
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();
    if (!_.has(self.versions, name)) {
      return [];
    }
    var ret = _.keys(self.versions[name]);
    ret.sort(packageVersionParser.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var lookupVersion = function () {
      return _.has(self.versions, name) &&
        _.has(self.versions[name], version) &&
        self.versions[name][version];
    };

    // The catalog doesn't understand buildID versions and doesn't know about
    // them. Depending on when we build them, we can refer to local packages as
    // 1.0.0+local or 1.0.0+[buildId]. Luckily, we know which packages are
    // local, so just look those up by their local version instead.
    // XXX ideally we'd only have isLocalPackage in the complete catalog and
    //     have CompleteCatalog override getVersion, but other things want
    //     to call isLocalPackage, eg maybeDownloadPackageForArchitectures
    //     which has the official package when running make-bootstrap-tarballs
    if (self.isLocalPackage(name)) {
      version = self._getLocalVersion(version);
      // No need to refresh here: if we can't find the local version, refreshing
      // isn't going to help!
      return lookupVersion() || null;
    }

    return self._recordOrRefresh(lookupVersion);
  },

  // Overridden by CompleteCatalog.
  // XXX this is kinda sketchy, maybe callers should only call this
  //     on the CompleteCatalog?
  isLocalPackage: function () {
    return false;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  // It does not include prereleases (with dashes in the version);
  getLatestMainlineVersion: function (name) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versions = self.getSortedVersions(name);
    versions.reverse();
    var latest = _.find(versions, function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return self.getVersion(name, latest);
  },

  // If this package has any builds at this version, return an array of builds
  // which cover all of the required arches, or null if it is impossible to
  // cover them all (or if the version does not exist).
  getBuildsForArches: function (name, version, arches) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versionInfo = self.getVersion(name, version);
    if (! versionInfo)
      return null;

    // XXX if we have a choice between os and os.mac, this returns a random one.
    //     so in practice we don't really support "maybe-platform-specific"
    //     packages

    // Even though getVersion already has its own _recordOrRefresh, we need this
    // one, in case our local cache says "version exists but only for the wrong
    // arch" and the right arch has been recently published.
    // XXX should ensure at most one refresh
    return self._recordOrRefresh(function () {
      var allBuilds = _.where(self.builds, { versionId: versionInfo._id });
      var solution = null;
      utils.generateSubsetsOfIncreasingSize(allBuilds, function (buildSubset) {
        // This build subset works if for all the arches we need, at least one
        // build in the subset satisfies it. It is guaranteed to be minimal,
        // because we look at subsets in increasing order of size.
        var satisfied = _.all(arches, function (neededArch) {
          return _.any(buildSubset, function (build) {
            var buildArches = build.buildArchitectures.split('+');
            return !!archinfo.mostSpecificMatch(neededArch, buildArches);
          });
        });
        if (satisfied) {
          solution = buildSubset;
          return true;  // stop the iteration
        }
      });
      return solution;  // might be null!
    });
  },

  // Unlike the previous, this looks for a build which *precisely* matches the
  // given buildArchitectures string. Also, it takes a versionRecord rather than
  // name/version.
  getBuildWithPreciseBuildArchitectures: function (versionRecord,
                                                   buildArchitectures) {
    var self = this;
    buildmessage.assertInCapture();
    self._requireInitialized();

    return self._recordOrRefresh(function () {
      return _.findWhere(self.builds,
                         { versionId: versionRecord._id,
                           buildArchitectures: buildArchitectures });
    });
  },

  getAllBuilds: function (name, version) {
    var self = this;
    self._requireInitialized();
    buildmessage.assertInCapture();

    var versionRecord = self.getVersion(name, version);
    if (!versionRecord)
      return null;

    return _.where(self.builds, { versionId: versionRecord._id });
  },

  // Reload catalog data to account for new information if needed.
  refresh: function () {
    throw new Error("no such thing as a base refresh");
  }
});
