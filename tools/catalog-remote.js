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
var sqlite3 = require('sqlite3');
var archinfo = require('./archinfo.js');

// XXX: Rationalize these flags.  Maybe use the logger?
DEBUG_SQL = !!process.env.METEOR_DEBUG_SQL;

METADATA_LAST_SYNC = "lastsync";

var Db = function (dbFile, options) {
  var self = this;

  self._dbFile = dbFile;

  self._autoPrepare = true;
  self._prepared = {};

  self._db = self.open(dbFile);
};

_.extend(Db.prototype, {
  runInTransaction: function (action) {
    var self = this;
    var future = new Future();
    // XXX: serialize doesn't work with fibers
    self._db.serialize(function () {
      var t1 = Date.now();

      var rollback = true;
      var result = null;
      var resultError = null;

      self.execute("BEGIN IMMEDIATE TRANSACTION");
      try {
        result = action(self);
        rollback = false;
      } catch (err) {
        resultError = err;
      }

      if (!rollback) {
        try {
          self.execute("END TRANSACTION");
        } catch (err) {
          rollback = true;
          console.log("Transaction commit failed ", err);
          if (!resultError) {
            resultError = err;
          }
        }
      }

      if (rollback) {
        try {
          self.execute("ROLLBACK TRANSACTION");
        } catch (err) {
          // Now we are out of options...
          console.log("Transaction rollback failed ", err);
          if (!resultError) {
            resultError = err;
          }
        }
      }

      if (DEBUG_SQL) {
        var t2 = Date.now();
        console.log("Transaction took: ", (t2 - t1));
      }

      if (resultError) {
        future['throw'](resultError);
      } else {
        future['return'](result);
      }
    });
    return future.wait();
  },

  open: function (dbFile) {
    var self = this;

    if ( !fs.existsSync(path.dirname(dbFile)) ) {
      var folder = path.dirname(dbFile);
      if ( !files.mkdir_p(folder) )
        throw new Error("Could not create folder at " + folder);
    }

    console.log("Opening db file", dbFile);
    return new sqlite3.Database(dbFile);
  },

  // Runs a query synchronously, returning all rows
  query: function (sql, params) {
    var self = this;

    var prepared = null;
    if (false && self._autoPrepare) {
      prepared = self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    var future = new Future();

    //console.log("Executing SQL ", sql);

    var callback = function (err, rows) {
      if (err) {
        future['throw'](err);
      } else {
        future['return'](rows);
      }
    };

    if (prepared) {
      prepared.all(sql, params, callback);
    } else {
      self._db.all(sql, params, callback);
    }

    var ret = future.wait();

    if (DEBUG_SQL) {
      var t2 = Date.now();
      if ((t2 - t1) > 10) {
        console.log("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return ret;
  },

  // Runs a query synchronously, returning no rows
  execute: function (sql, params) {
    var self = this;

    var prepared = null;
    if (self._autoPrepare) {
      prepared = self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    var future = new Future();

    //console.log("Executing SQL ", sql);

    var callback = function (err, rows) {
      if (err) {
        future['throw'](err);
      } else {
        future['return'](rows);
      }
    };

    if (prepared) {
      prepared.run(params, callback);
    } else {
      self._db.run(sql, params, callback);
    }

    var ret = future.wait();

    if (DEBUG_SQL) {
      var t2 = Date.now();
      if ((t2 - t1) > 10) {
        console.log("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return ret;
  },

  // Prepares the statement, caching the result
  _prepareWithCache: function (sql) {
    var self = this;

    var prepared = self._prepared[sql];
    if (!prepared) {
      //console.log("Preparing statement: ", sql);
      var future = new Future();
      prepared = self._db.prepare(sql, function (err) {
        if (err) {
          future['throw'](err);
        } else {
          future['return']();
        }
      });
      future.wait();
      self._prepared[sql] = prepared;
    }
    return prepared;
  }

});


var Table = function (name, jsonFields) {
  var self = this;

  self.name = name;
  self.jsonFields = jsonFields;

  self._buildStatements();
};

_.extend(Table.prototype, {
  _buildStatements: function () {
    var self = this;

    var queryParams = self._generateQuestionMarks(self.jsonFields.length + 1);
    self._selectQuery = "SELECT * FROM " + self.name + " WHERE _id=?";
    self._insertQuery = "INSERT INTO " + self.name + " VALUES " + queryParams;
    self._deleteQuery = "DELETE FROM " + self.name + " WHERE _id=?";
  },

  //Generate a string of the form (?, ?) where the n is the number of question mark
  _generateQuestionMarks: function (n) {
    return "(" + _.times(n, function () { return "?" }).join(",") + ")";
  },

  find: function (txn, id) {
    var self = this;
    var rows = txn.query(self._selectQuery, [ id ]);
    if (rows.length !== 0) {
      if (rows.length !== 1) {
        throw new Error("Corrupt database (PK violation)");
      }
      return rows[0];
    }
    return undefined;
  },

  upsert: function (txn, objects) {
    var self = this;

    // XXX: Use sqlite upsert
    // XXX: Speculative insert
    // XXX: Fix transaction logic so we always roll back
    _.each(objects, function (o) {
      var id = o._id;
      var rows = txn.query(self._selectQuery, [ id ]);
      if (rows.length !== 0) {
        txn.execute(self._deleteQuery, [ id ]);
      }
      var row = [];
      _.each(self.jsonFields, function (jsonField) {
        row.push(o[jsonField]);
      });
      row.push(JSON.stringify(o));
      txn.execute(self._insertQuery, row);
    });
  },

  createTable: function (txn) {
    var self = this;

    var sql = 'CREATE TABLE IF NOT EXISTS ' + self.name + '(';
    for (var i = 0; i < self.jsonFields.length; i++) {
      var jsonField = self.jsonFields[i];
      var sqlColumn = jsonField;
      if (i != 0) sql += ",";
      sql += sqlColumn + " STRING";
      if (sqlColumn === '_id') {
        sql += " PRIMARY KEY";
      }
    }
    sql += ", content STRING";
    sql += ")";
    txn.execute(sql);

    //sql = "CREATE INDEX IF NOT EXISTS idx_" + self.name + "_id ON " + self.name + "(_id)";
    //txn.execute(sql);
  }
});


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
  self._currentRefreshIsLoud = false;
};

_.extend(RemoteCatalog.prototype, {
  getVersion: function (name, version) {
    var result = this._queryAsJSON("SELECT content FROM versions WHERE packageName=? AND version=?", [name, version]);
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
    if (!name) {
      throw new Error("No name provided");
    }
    return this._queryAsJSON("SELECT content FROM versions WHERE packageName=?", name);
  },

  getAllBuilds: function (name, version) {
    var result = this._queryAsJSON("SELECT * FROM builds WHERE builds.versionId = (SELECT _id FROM versions WHERE versions.packageName=? AND versions.version=?)", [name, version]);
    if (!result || result.length === 0)
      return null;
    return result;
  },

  getBuildsForArches: function (name, version, arches) {
    var self = this;

    var solution = null;
    var allBuilds = self.getAllBuilds(name, version);

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
    return _.pluck(this._queryWithRetry("SELECT name FROM packages"), 'name');
  },

  initialize: function (options) {
    var self = this;

    options = options || {};
    // We should to figure out if we are intending to connect to the package server.
    self.offline = options.offline ? options.offline : false;

    var dbFile = options.packageStorage || config.getPackageStorage();
    self.db = new Db(dbFile);

    self.tableVersions = new Table('versions', ['packageName', 'version', '_id']);
    self.tableBuilds = new Table('builds', ['versionId', '_id']);
    self.tableReleaseTracks = new Table('releaseTracks', ['name', '_id']);
    self.tableReleaseVersions = new Table('releaseVersions', ['track', 'version', '_id']);
    self.tablePackages = new Table('packages', ['name', '_id']);
    self.tableSyncToken = new Table('syncToken', ['_id']);
    self.tableMetadata = new Table('metadata', ['_id']);

    self.allTables = [ self.tableVersions,
      self.tableBuilds,
      self.tableReleaseTracks,
      self.tableReleaseVersions,
      self.tablePackages,
      self.tableSyncToken,
      self.tableMetadata ]
    return self.db.runInTransaction(function(txn) {
      _.each(self.allTables, function (table) {
        table.createTable(txn);
      });

      // Extra indexes for the most expensive queries
      // These are non-unique indexes
      txn.execute("CREATE INDEX IF NOT EXISTS versionsNamesIdx ON versions(packageName)");
      txn.execute("CREATE INDEX IF NOT EXISTS buildsVersionsIdx ON builds(versionId)");
    });
  },

  // This function empties the DB. This is called from the package-client.
  reset: function () {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      _.each(self.allTables, function (table) {
        txn.execute("DELETE FROM " + table.name);
      });
    });
  },

  refresh: function (options) {
    var self = this;
    options = options || {};

    console.log("In remote catalog refresh");

    buildmessage.assertInCapture();
    if (self.offline)
      return;

    if (options.maxAge) {
      var lastSync = self.getMetadata(METADATA_LAST_SYNC);
      console.log("lastSync = ", lastSync);
      if (lastSync && lastSync.timestamp) {
        if ((Date.now() - lastSync.timestamp) < options.maxAge) {
          console.log("Catalog is sufficiently up-to-date");
          return;
        }
      }
    }

    if (!options.silent) {
      self._currentRefreshIsLoud = true;
    }

    var updateResult = {};
    buildmessage.enterJob({ title: 'Refreshing package metadata.' }, function () {
      updateResult = packageClient.updateServerPackageData(self);
    });
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

  isLocalPackage: function() {
    return false;
  },

  _queryWithRetry: function (query, values, options) {
    var self = this;
    var result = self._justQuery(query, values);
    if ( result.length !== 0 || ( options && options.noRetry ) )
      return result;
    console.log("Forcing refresh because of _queryWithRetry", query, values);
    self.refresh();
    return self._justQuery(query, values);
  },

  // Runs a query synchronously.
  // Query is the sql query to be executed and values are the parameters of the query
  _justQuery: function (query, values) {
    var self = this;
    var results;
    try {
      results = self.db.query(query, values);
    } catch (err) {
      // XXX: Throw?
      console.log("Error running query ", query, err);
      results = [];
    }
    if (results !== [])
      return results;
    // XXX: Scary
    console.log("Forcing refresh in _justQuery");
    self.refresh();
    // XXX: What should we return here??
    return results;
  },

  // Execute a query using the values as arguments of the query and return the result as JSON.
  // This code assumes that the table being queried always have a column called "entity"
  _queryAsJSON: function (query, values, options) {
    var self = this;
    console.log("Executing query with _queryAsJSON: ", query);
    var rows = self._queryWithRetry(query, values, options);
    return _.map(rows, function(entity) {
      return JSON.parse(entity.content);
    });
  },

  //Given data from troposphere, add it into the local store
  insertData: function(serverData) {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      self.tablePackages.upsert(txn, serverData.collections.packages);
      self.tableBuilds.upsert(txn, serverData.collections.builds);
      self.tableVersions.upsert(txn, serverData.collections.versions);
      self.tableReleaseTracks.upsert(txn, serverData.collections.releaseTracks);
      self.tableReleaseVersions.upsert(txn, serverData.collections.releaseVersions);

      var syncToken = serverData.syncToken;
      console.log("Adding syncToken: ", JSON.stringify(syncToken));
      syncToken._id = "1"; //Add fake _id so it fits the pattern
      self.tableSyncToken.upsert(txn, [syncToken]);

      var lastSync = { timestamp: Date.now() };
      self._setMetadata(txn, METADATA_LAST_SYNC, lastSync);
    });
  },

  getLoadPathForPackage: function (name, version, constraintSolverOpts) {
    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
    return null;
  },

  getSyncToken: function() {
    var self = this;
    var result = self._queryAsJSON("SELECT content FROM syncToken", [], { noRetry: true });
    if (!result || result.length === 0) {
      console.log("No sync token found");
      return {};
    }
    if (result.length !== 1) {
      throw new Error("Unexpected number of sync tokens found");
    }
    delete result[0]._id;
    //console.log(utils.getStackTrace());
    console.log("Returning sync token: " + JSON.stringify(result[0]));
    return result[0];
  },

  getMetadata: function(key) {
    var self = this;
    var row = self.tableMetadata.find(self.db, key);
    if (row) {
      return JSON.parse(row['content']);
    }
    return undefined;
  },

  setMetadata: function(key, value) {
    var self = this;
    self.db.runInTransaction(function (txn) {
      self._setMetadata(txn, key, value);
    });
  },

  _setMetadata: function(txn, key, value) {
    var self = this;
    value._id = key;
    self.tableMetadata.upsert(txn, [value]);
  }
});

exports.RemoteCatalog = RemoteCatalog;

//We put this constant here because we don't have any better place that would otherwise cause a cycle
exports.DEFAULT_TRACK = 'METEOR';

//The catalog as provided by troposhere (aka atomospherejs.com)
exports.official = new RemoteCatalog();
