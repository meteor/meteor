var _ = require('underscore');

var LayeredCatalog = function() {
	var self = this;

	self.localCatalog = null;
	self.otherCatalog = null;
};

_.extend(LayeredCatalog.prototype, {
  setCatalogs: function(local, remote) {
    var self = this;
    self.localCatalog = local;
    self.otherCatalog = remote;
  },

  addLocalPackage: function (directory) {
    var self = this;
    self.localCatalog.addLocalPackage(directory);
  },

  getAllBuilds: function (name, version) {
    var self = this;
    return self._returnFirst("getAllBuilds", arguments, [[], null]);
  },

  getAllPackageNames: function () {
    var self = this;
    return _.union(self.localCatalog.getAllPackageNames(), self.otherCatalog.getAllPackageNames());
  },

  getAllReleaseTracks: function () {
    return this._returnFirst("getAllReleaseTracks", arguments, [[]]);
  },

  _returnFirst: function(f, args, unacceptableValues) {
    var self = this;
    var result = self.localCatalog[f](args);
    if ( ! (_.contains(unacceptableValues, result) )) {
      return result;
    }
    return self.otherCatalog[f](args);
  },

  getBuildsForArches: function (name, version, arches) {
    return this._returnFirst("getBuildsForArches", arguements, [[], null]);
  },

  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    return this._returnFirst("getBuildWithPreciseBuildArchitectures", arguements, [[], null]);
  },

  getDefaultReleaseVersion: function (track) {
    return this.otherCatalog.getDefaultReleaseVersion(track);
  },

  getForgottenECVs: function (packageName) {
    var self = this;
  },

  getLatestMainlineVersion: function (name) {
    return this._returnFirst("getLatestMainlineVersion", arguements, [[], null]);
  },

  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var self = this;
  },

  getLocalPackageNames: function () {
    return this.localCatalog.getLocalPackageNames();
  },

  getPackage: function (name, options) {
    return this._returnFirst("getPackage", arguements, [[], null]);
  },

  getReleaseTrack: function (name) {
    return this.otherCatalog.getReleaseTrack(name);
  },

  getReleaseVersion: function (track, version) {
    return this.otherCatalog.getReleaseVersion(track, version);
  },

  getSortedRecommendedReleaseVersions: function (track, laterThanOrderKey) {
    return this.otherCatalog.getSortedRecommendedReleaseVersions(track, version);
  },

  getSortedVersions: function (name) {
    return this._returnFirst("getSortedVersions", arguements, [[], null]);
  },

  getVersion: function (name, version) {
    return this._returnFirst("getVersion", arguements, [[], null]);
  },

  initialize: function (options) {
    throw new Exception("initializing the layered catalog is not supported");
  },

  isLocalPackage: function (name) {
    return this.localCatalog.isLocalPackage(name);
  },

  rebuildLocalPackages: function (namedPackages) {
    return this.localCatalog.rebuildLocalPackages(namedPackages);
  },

  refresh: function () {
    var self = this;
    //PASCAL Deal with refresh properly
  },

  refreshInProgress: function () {
    var self = this;
    //PASCAL Deal with refresh properly
  },

  reset: function () {
    this.localCatalog.reset();
  },

  resolveConstraints : function (constraints, resolverOpts, opts) {
    var self = this;
  },
  watchLocalPackageDirs: function (watchSet) {
    var self = this;
  }
});

exports.LayeredCatalog = LayeredCatalog;
