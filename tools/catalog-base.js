var fs = require('fs');
var path = require('path');
var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var Unipackage = require('./unipackage.js').Unipackage;
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var watch = require('./watch.js');
var files = require('./files.js');

var baseCatalog = exports;

// XXX "Meteor-Core"? decide this pre 0.9.0.
baseCatalog.DEFAULT_TRACK = 'METEOR-CORE';

// This is a basic catalog class. It accesses basic catalog data by looking
// through the catalog's collections.
//
// YOU MUST SET self.initialized = true BEFORE USING THIS CATALOG. In fact, the
// protolog is not even intended to be used by itself -- there is a server
// catalog and a constraint solving catalog, which inherit from it.
baseCatalog.BaseCatalog = function () {
  var self = this;

  // Package server data. Arrays of objects.
  self.packages = null;
  self.versions = null;
  self.builds = null;
  self.releaseTracks = null;
  self.releaseVersions = null;

  // We use the initialization design pattern because it makes it easier to use
  // both of our catalogs as singletons.
  self.initialized = false;

};

// XXX: We have a pattern on retrieval of data, where we try, fail, then try to
// refresh. Do we want to keep that? I think so. Come back to it.

_.extend(baseCatalog.BaseCatalog.prototype, {
  // Set all the collections to their initial values, which are mostly
  // blank. This does not set self.initialized -- do that manually in the child
  // class when applicable.
  reset: function () {
    var self = this;

    // Initialize everything to its default version.
    self.packages = [];
    self.versions = [];
    self.builds = [];
    self.releaseTracks = [];
    self.releaseVersions = [];
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

    _.each(
      ['packages', 'versions', 'builds', 'releaseTracks', 'releaseVersions'],
      function (field) {
        self[field].push.apply(self[field], collections[field]);
      });
  },

  // Accessor methods below. The primary function of both catalogs is to provide
  // data about the existence of various packages, versions, etc, which it does
  // through these methods.

  // Returns general (non-version-specific) information about a
  // release track, or null if there is no such release track.
  getReleaseTrack: function (name) {
    var self = this;
    self._requireInitialized();
    return _.findWhere(self.releaseTracks, { name: name });
  },

  // Return information about a particular release version, or null if such
  // release version does not exist.
  getReleaseVersion: function (track, version) {
    var self = this;
    self._requireInitialized();

    var retrieveRecord = function () {
      return _.findWhere(self.releaseVersions,
                         { track: track,  version: version });
    };
    var versionRecord =  retrieveRecord();

    // The first time, we try to refresh and try again. If we don't have the
    // information after that, tough luck.
    if (!versionRecord) {
      self.refresh();
      versionRecord =  retrieveRecord();
    }
    if (!versionRecord) {
        return null;
    }
    return versionRecord;

  },

  // Return an array with the names of all of the release tracks that we know
  // about, in no particular order.
  getAllReleaseTracks: function () {
    var self = this;
    self._requireInitialized();
    return _.pluck(self.releaseTracks, 'name');
  },

  // Given a release track, return all recommended versions for this track, sorted
  // by their orderKey. Returns the empty array if the release track does not
  // exist or does not have any recommended versions.
  getSortedRecommendedReleaseVersions: function (track) {
    var self = this;
    self._requireInitialized();

    var recommended = _.where(self.releaseVersions, { track: track, recommended: true});
    var recSort = _.sortBy(recommended, function (rec) {
      return rec.orderKey;
    });
    recSort.reverse();
    return _.pluck(recSort, "version");
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
  getPackage: function (name) {
    var self = this;
    self._requireInitialized();
    return _.findWhere(self.packages, { name: name });
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();

    var ret = _.pluck(_.where(self.versions, { packageName: name }),
                      'version');
    ret.sort(semver.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    // The catalog doesn't understand buildID versions and doesn't know about
    // them. Depending on when we build them, we can refer to local packages as
    // 1.0.0+local or 1.0.0+[buildId]. Luckily, we know which packages are
    // local, so just look those up by their local version instead.
    if (self.isLocalPackage(name)) {
      version = self._getLocalVersion(version);
    }

    var retrieveRecord = function () {
      return  _.findWhere(self.versions, { packageName: name,
                                           version: version });
    };
    var versionRecord =  retrieveRecord();

    // The first time, we try to refresh and try again. If we don't have the
    // information after that, tough luck.
    if (!versionRecord) {
      self.refresh();
      versionRecord =  retrieveRecord();
    }
    if (!versionRecord) {
        return null;
    }
    return versionRecord;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;
    self._requireInitialized();

    var versions = self.getSortedVersions(name);
    if (versions.length === 0)
      return null;
    return self.getVersion(name, versions[versions.length - 1]);
  },

  // If this package has any builds at this version, return an array of builds
  // which cover all of the required arches, or null if it is impossible to
  // cover them all (or if the version does not exist).
  getBuildsForArches: function (name, version, arches) {
    var self = this;
    self._requireInitialized();

    var versionInfo = self.getVersion(name, version);
    if (! versionInfo)
      return null;

    // XXX this uses a greedy algorithm that might decide, when we're looking
    // for ["browser", "os.mac"] that we should download browser+os.linux to
    // satisfy browser and browser+os.mac to satisfy os.mac.  This is not
    // optimal, but on the other hand you might want the linux one later anyway
    // for deployment.
    // XXX if we have a choice between os and os.mac, this returns a random one.
    //     so in practice we don't really support "maybe-platform-specific"
    //     packages

    var neededArches = {};
    _.each(arches, function (arch) {
      neededArches[arch] = true;
    });

    var buildsToUse = [];
    var allBuilds = _.where(self.builds, { versionId: versionInfo._id });
    for (var i = 0; i < allBuilds.length && !_.isEmpty(neededArches); ++i) {
      var build = allBuilds[i];
      // XXX why isn't this a list in the DB?  I guess because of the unique
      // index?
      var buildArches = build.architecture.split('+');
      var usingThisBuild = false;
      _.each(neededArches, function (ignored, neededArch) {
        if (archinfo.mostSpecificMatch(neededArch, buildArches)) {
          // This build gives us something we need! We don't need it any
          // more. (It is safe to delete keys of something you are each'ing over
          // because _.each internally is doing an iteration over _.keys.)
          delete neededArches[neededArch];
          if (! usingThisBuild) {
            usingThisBuild = true;
            buildsToUse.push(build);
            // XXX this should probably be denormalized in the DB
            build.version = version;
          }
        }
      });
    }

    if (_.isEmpty(neededArches))
      return buildsToUse;
    // We couldn't satisfy it!
    return null;
  },

  // Unlike the previous, this looks for a build which *precisely* matches the
  // given architectures string (joined with +). Also, it takes a versionRecord
  // rather than name/version.
  getBuildWithArchesString: function (versionRecord, archesString) {
    var self = this;
    self._requireInitialized();

    return _.findWhere(self.builds,
                       { versionId: versionRecord._id,
                         architecture: archesString });
  },

  getAllBuilds: function (name, version) {
    var self = this;
    self._requireInitialized();

    var versionRecord = self.getVersion(name, version);
    if (!versionRecord)
      return null;

    return _.where(self.builds, { versionId: versionRecord._id });
  },

  // Returns the default release version: the latest recommended version on the
  // default track. Returns null if no such thing exists (even after syncing
  // with the server, which it only does if there is no eligible release
  // version).
  getDefaultReleaseVersion: function () {
    var self = this;
    self._requireInitialized();

    var attempt = function () {
      var versions = self.getSortedRecommendedReleaseVersions(
        catalog.DEFAULT_TRACK);
      if (!versions.length)
        return null;
      return {track: catalog.DEFAULT_TRACK, version: versions[0]};
    };

    var ret = attempt();
    if (!ret) {
      self.refresh(true);
      ret = attempt();
    }
    return ret;
  },

  // Given a name and a version of a package, return a path on disk
  // from which we can load it. If we don't have it on disk (we
  // haven't downloaded it, or it just plain doesn't exist in the
  // catalog) return null.
  //
  // Doesn't download packages. Downloading should be done at the time
  // that .meteor/versions is updated.
  getLoadPathForPackage: function (name, version) {
    var self = this;

    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
     return null;
  },

  // Reload catalog data to account for new information if needed.
  refresh: function () {
    throw new Error("no such thing as a base refresh");
  }
});
