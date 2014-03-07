var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');

var catalog = exports;

// Use this class to query the metadata for all of the packages that
// we know about (including packages on the package server that we
// haven't actually download yet).
//
// XXX move into release
// XXX add packageDirs
//
// XXX make constraint solver take 'cat'
catalog.Catalog = function () {
  var self = this;

  self.loaded = false; // #CatalogLazyLoading
  self.packages = null;
  self.versions = null;
  self.builds = null;
};

_.extend(catalog.Catalog.prototype, {
  // #CatalogLazyLoading
  // Currently, packageClient.loadPackageData() talks to the network
  // (because it implicitly syncs). Since Catalog is part of the
  // release, we create it very early, before the release is set up
  // and therefore before we can load unipackages, which is necessary
  // to talk to the network. So defer actually calling loadPackageData
  // until we actually begin using the catalog.
  //
  // In the future, a better solution might be to make syncing
  // explicit rather than a side effect of loadPackageData?
  _ensureLoaded: function () {
    var self = this;
    if (self.loaded)
      return;

    var collections = packageClient.loadPackageData();
    self.packages = collections.packages;
    self.versions = collections.versions;
    self.builds = collections.builds;
    self.loaded = true;
  },

  // Return an array with the names of all of the packages that we
  // know about, in no particular order.
  getAllPackageNames: function () {
    var self = this;
    self._ensureLoaded();

    var ret = [];
    self.packages.find().forEach(function (packageInfo) {
      ret.push(packageInfo.name);
    });
    return ret;
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name) {
    var self = this;
    self._ensureLoaded();
    return self.packages.findOne({ name: name });
  },

  // Given a package, returns an array of the versions available for
  // this package (for any architecture), sorted from oldest to newest
  // (according to the version string, not according to their
  // publication date). Returns the empty array if the package doesn't
  // exist or doesn't have any versions.
  getSortedVersions: function (name) {
    var self = this;
    self._ensureLoaded();

    var cursor = self.versions.find({ packageName: name },
                                    { fields: { version: 1 }});
    var ret = _.pluck(cursor.fetch(), 'version');
    ret.sort(semver.compare);
    return ret;
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._ensureLoaded();
    return self.versions.findOne({ packageName: name,
                                   version: version });
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;
    self._ensureLoaded();

    var versions = self.getSortedVersions(name);
    if (versions.length === 0)
      return null;
    return self.getVersion(name, versions[versions.length - 1]);
  },

  // If this package has any builds at this version, return an
  // arbitrarily chosen one, or null if it has no builds.  XXX
  // temporary hack, should go away
  getAnyBuild: function (name, version) {
    var self = this;
    self._ensureLoaded();

    var versionInfo = self.getVersion(name, version);
    if (! versionInfo)
      return null;
    var buildInfo = self.builds.findOne({ versionId: versionInfo._id });
    return buildInfo;
  }

});
