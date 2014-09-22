var fs = require('fs');
var path = require('path');
var Future = require('fibers/future');
var _ = require('underscore');
var auth = require('./auth.js');
var httpHelpers = require('./http-helpers.js');
var release = require('./release.js');
var files = require('./files.js');
var ServiceConnection = require('./service-connection.js');
var utils = require('./utils.js');
var buildmessage = require('./buildmessage.js');
var compiler = require('./compiler.js');
var uniload = require('./uniload.js');
var tropohouse = require('./tropohouse.js');
var config = require('./config.js');
var semver = require('semver');
var packageClient = require('./package-client.js');
var sqlite3 = require('../dev_bundle/bin/node_modules/sqlite3');

// A RemoteCatalog is a local cache of the content of troposphere.
// A default instance of this catalog is registered by the layered catalog and is available
// under the variable "official" from the catalog.js
//
// The remote catalog is backed by a db to make things easier on the memory and for faster queries
var RemoteCatalog = function (options) {
  var self = this;

  // Set this to true if we are not going to connect to the remote package
  // server, and will only use the cached data for our package information
  // This means that the catalog might be out of date on the latest developments.
  self.offline = null;

  self.options = options || {};

  self.db = null;
};

_.extend(RemoteCatalog.prototype, {
  getVersion: function (name, version) {
    var result = this._queryAsJSON("SELECT content FROM versions WHERE name=? AND version=?", [name, version]);
    if(!result || result.length === 0) {
      return null;
    }
    return result[0];
  },

  getSortedVersions: function (name) {
    var self = this;
    var match = this._getPackages(name);
    if (match === null)
      return [];
    return _.pluck(match, 'version').sort(semver.compare);
  },

  // Copied from base-catalog
  getLatestMainlineVersion: function (name) {
    var self = this;
    var versions = self.getSortedVersions(name);
    versions.reverse();
    var latest = _.find(versions, function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return self.getVersion(name, latest);
  },

  getPackage: function (name) {
    var result = this._getPackages(name);
    if (!result || result.length === 0)
      return null;
    return result[0];
  },
  
  _getPackages: function (name) {
    return this._queryAsJSON("SELECT content FROM versions WHERE name=?", name);
  },

  getAllBuilds: function (name, version) {
    var result = this._queryAsJSON("SELECT * FROM builds WHERE builds.versionId = (SELECT id FROM versions WHERE versions.name=? AND versions.version=?)", [name, version]);
    if (!result || result.length === 0)
      return null;
    return result;
  },

  getBuildsForArches: function (name, version, arches) {
    var solution = null;
    var allBuilds = getAllBuilds(name, version);

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
  },

  // Returns general (non-version-specific) information about a
  // release track, or null if there is no such release track.
  getReleaseTrack: function (name) {
    var self = this;
    var result = self._queryAsJSON("SELECT content FROM releaseTracks WHERE name=?", name);
    if (!result || result.length === 0)
      return null;
    return result[0];
  },

  getReleaseVersion: function (track, version) {
    var self = this;
    var result = self._queryAsJSON("SELECT content FROM releaseVersions WHERE track=? AND version=?", [track, version]);
    if (!result || result.length === 0)
      return null;
    return result[0];
  },

  getAllReleaseTracks: function () {
    return _.pluck(this._queryWithRetry("SELECT name FROM releaseTracks"), 'name');
  },

  getAllPackageNames: function () {
    return _.pluck(this._queryWithRetry("SELECT name FROM packages"));
  },

  initialize: function (options) {
    var self = this;

    options = options || {};
    // We should to figure out if we are intending to connect to the package server.
    self.offline = options.offline ? options.offline : false;

    var dbFile = self.options.packageStorage || config.getPackageStorage();
    if ( !fs.existsSync(path.dirname(dbFile)) ) {
      fs.mkdirSync(path.dirname(dbFile));
    }
    self.db = new sqlite3.Database(dbFile);

    var future = new Future;
    self.db.serialize(function() {
      self.db.run("BEGIN IMMEDIATE TRANSACTION");
      self.db.run("CREATE TABLE IF NOT EXISTS versions (name STRING, version STRING, id String, content STRING)");
      self.db.run("CREATE INDEX IF NOT EXISTS versionsNamesIdx ON versions(name)");

      self.db.run("CREATE TABLE IF NOT EXISTS builds (versionId STRING, id STRING, content STRING)");
      self.db.run("CREATE INDEX IF NOT EXISTS buildsVersionsIdx ON builds(versionId)");

      // These tables don't get an index because they are small and/or not often used
      self.db.run("CREATE TABLE IF NOT EXISTS releaseTracks (name STRING, id STRING, content STRING)");
      self.db.run("CREATE TABLE IF NOT EXISTS releaseVersions (track STRING, version STRING, id STRING, content STRING)");
      self.db.run("CREATE TABLE IF NOT EXISTS packages (name STRING, id STRING, content STRING)");
      self.db.run("CREATE TABLE IF NOT EXISTS syncToken (id STRING, content STRING)");
      self.db.run("END TRANSACTION", function(err, row) {
        if (err)
          console.log("TRANSACTION PB 1 " + err);
        //PASCAL check errors
        future.return();
      });
    });
    future.wait();
  },

  // This function empties the DB. This is called from the package-client.
  reset: function () {
    var self = this;
    var future = new Future;
    self.db.serialize(function() {
      self.db.run("BEGIN IMMEDIATE TRANSACTION");
      self.db.run("DELETE FROM versions");
      self.db.run("DELETE FROM builds");
      self.db.run("DELETE FROM releaseTracks");
      self.db.run("DELETE FROM releaseVersions");
      self.db.run("DELETE FROM packages");
      self.db.run("DELETE FROM syncToken");
      self.db.run("END TRANSACTION", function(err, row) {
        if (err)
          console.log("TRANSACTION PB 2 " + err);
        //PASCAL check errors
        future.return();
      });
    });
    future.wait();
  },

  refresh: function () {
    var self = this;
    if (self.offline)
      return;

    var patience = new utils.Patience({
      messageAfterMs: 2000,
      message: function () {
        if (self._currentRefreshIsLoud) {
          console.log("Refreshing package metadata. This may take a moment.");
        }
      }
    });

    var updateResult = {};
    try {
      packageClient.updateServerPackageData(this);
    } finally {
      patience.stop();
    }
    if (!updateResult.data) {
      process.stderr.write("Warning: could not connect to package server\n");
    }
    if (updateResult.resetData) {
      tropohouse.default.wipeAllPackages();
      self.reset();
    }

  },

  // Given a release track, return all recommended versions for this track, sorted
  // by their orderKey. Returns the empty array if the release track does not
  // exist or does not have any recommended versions.
  getSortedRecommendedReleaseVersions: function (track, laterThanOrderKey) {
    var self = this;
    var result = self._queryAsJSON("SELECT content FROM releaseVersions WHERE track=?", track);

    var recommended = _.filter(result, function (v) {
      if (!v.recommended)
        return false;
      return !laterThanOrderKey || v.orderKey > laterThanOrderKey;
    });

    var recSort = _.sortBy(recommended, function (rec) {
      return rec.orderKey;
    });
    recSort.reverse();
    return _.pluck(recSort, "version");
  },

  getDefaultReleaseVersion: function (track) {
    var self = this;

    if (!track)
      track = exports.DEFAULT_TRACK;

    var versions = self.getSortedRecommendedReleaseVersions(track);
    if (!versions.length)
      return null;
    return {track: track, version: versions[0]};
  },

  getBuildWithPreciseBuildArchitectures: function (versionRecord, buildArchitectures) {
    var self = this;
    var matchingBuilds = this._queryAsJSON("SELECT content FROM builds WHERE versionId=?", versionRecord._id);
    return _.findWhere(matchingBuilds, { buildArchitectures: buildArchitectures });
  },

  isLocalPackage : function() {
    return false;
  },

  _queryWithRetry: function (query, values, options) {
    var self = this;
    var result = self._justQuery(query, values);
    if ( result.length !== 0 || ( options && options.noRetry ) )
      return result;
    self.refresh();
    return self._justQuery(query, values);
  },

  // Runs a query synchronously.
  // Query is the sql query to be executed and values are the parameters of the query
  _justQuery: function (query, values) {
    var future = new Future;
    this.db.all(query, values, function(err, rows) {
      if (err) {
        future.return([]);
        return;
      }

      future.return(rows);
    });
    var results = future.wait();
    if (results !== [])
      return results;
    self.refresh();

  },

  // Execute a query using the values as arguments of the query and return the result as JSON.
  // This code assumes that the table being queried always have a column called "entity"
  _queryAsJSON: function (query, values, options) {
    var rows = this._queryWithRetry(query, values, options);
    return _.map(rows, function(entity) {
        return JSON.parse(entity.content);
    });
  },

  //Generate a string of the form (?, ?) where the n is the number of question mark
  _generateQuestionMarks : function (n) {
    return "(" + _.times(n, function () { return "?" }).join(",") + ")";
  },

  _insertInTable : function(data, table, selFields) {
    var self = this;
    var queryParams = this._generateQuestionMarks(selFields.length + 1);
    var insertVersion = self.db.prepare("INSERT INTO " + table + " VALUES " + queryParams);
    var deleteVersion = self.db.prepare("DELETE FROM " + table + " WHERE id=?");
    _.each(data, function (entry) {
      self.db.get("SELECT * FROM " + table + " WHERE id=?", entry._id, function(err, row) {
        // PASCAL TOO do we need to check for error?
        if ( ! (row === undefined) ) {
          deleteVersion.run(entry._id);
        }
        var insertParam = [];
        _.each(selFields, function (field) {
          insertParam.push(entry[field]);
        });
        insertParam.push(JSON.stringify(entry));
        insertVersion.run(insertParam);
      });
    });
  },

  _insertPackages : function(packagesData) {
    this._insertInTable(packagesData, "packages", ['name', '_id']);
  },

  _insertVersions : function(versionsData) {
    this._insertInTable(versionsData, "versions", ['packageName', 'version', '_id']);
  },

  _insertBuilds : function(buildsData) {
    this._insertInTable(buildsData, "builds", ['versionId', '_id']);
  },

  _insertReleaseTracks : function(releaseTrackData) {
    this._insertInTable(releaseTrackData, "releaseTracks", ['name', '_id']);
  },

  _insertReleaseVersions : function(releaseVersionData) {
    this._insertInTable(releaseVersionData, "releaseVersions", ['track', 'version', '_id']);
  },

  _insertTimestamps : function(syncToken) {
    syncToken._id = "1"; //Add fake _id so it fits the pattern
    this._insertInTable([syncToken], "syncToken", ['_id']);
  },

  //Given data from troposphere, add it into the local store
  insertData : function(serverData) {
    var self = this;
    var future = new Future;
    self.db.serialize(function() {
      self.db.run("BEGIN IMMEDIATE TRANSACTION");
      self._insertPackages(serverData.collections.packages);
      self._insertBuilds(serverData.collections.builds);
      self._insertVersions(serverData.collections.versions);
      self._insertReleaseTracks(serverData.collections.releaseTracks);
      self._insertReleaseVersions(serverData.collections.releaseVersions);
      self._insertTimestamps(serverData.syncToken);
      self.db.run("END TRANSACTION", function(err, row) {
        if (err)
          console.log("TRANSACTION PB 3 " + err);
        //PASCAL check errors
        future.return();
      });
    });
    future.wait();
  },

  getLoadPathForPackage : function (name, version, constraintSolverOpts) {
    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
    return null;
  },

  getSyncToken : function() {
    var self = this;
    var result = self._queryAsJSON("SELECT content FROM syncToken", [], { noRetry: true });
    if (!result || result.length === 0)
      return {};
    delete result[0]._id;
    return result[0];
  }

});
exports.RemoteCatalog = RemoteCatalog;
//We put this constant here because we don't have any better place that would otherwise cause a cycle
exports.DEFAULT_TRACK = 'METEOR';