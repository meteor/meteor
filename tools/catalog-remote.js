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
var Console = require('./console.js').Console;

// XXX: Rationalize these flags.  Maybe use the logger?
DEBUG_SQL = !!process.env.METEOR_DEBUG_SQL;

SYNCTOKEN_ID = "1";

METADATA_LAST_SYNC = "lastsync";

BUSY_RETRY_ATTEMPTS = 10;
BUSY_RETRY_INTERVAL = 1000;

var Mutex = function () {
  var self = this;

  self._locked = false;

  self._waiters = [];
};

_.extend(Mutex.prototype, {
  lock: function () {
    var self = this;

    while (true) {
      if (!self._locked) {
        self._locked = true;
        return;
      }

      var fut = new Future();
      self._waiters.push(fut);
      fut.wait();
    }
  },

  unlock: function () {
    var self = this;

    if (!self._locked) {
      throw new Error("unlock called on unlocked mutex");
    }

    self._locked = false;
    var waiter = self._waiters.shift();
    if (waiter) {
      waiter['return']();
    }
  }
});

var Txn = function (db) {
  var self = this;
  self.db = db;
  self.closed = false;
  self.committed = false;
  self.started = false;
};

_.extend(Txn.prototype, {
  // Runs a SQL query and returns the rows
  query: function (sql, params) {
    var self = this;
    return self.db._query(sql, params);
  },

  // Runs a SQL statement, returning no rows
  execute: function (sql, params) {
    var self = this;
    return self.db._execute(sql, params);
  },

  // Start a transaction
  begin: function (mode) {
    var self = this;

    // XXX: Use DEFERRED mode?
    mode = mode || "IMMEDIATE";

    if (self.started) {
      throw new Error("Transaction already started");
    }

    self.db._execute("BEGIN " + mode + " TRANSACTION");
    self.started = true;
  },

  // Releases resources from the transaction; Rollback if commit not already called.
  close: function () {
    var self = this;

    if (self.closed) {
      return;
    }

    if (!self.started) {
      return;
    }

    self.db._execute("ROLLBACK TRANSACTION");
    self.committed = false;
    self.closed = true;
  },

  // Commits the transaction.  close() will then be a no-op
  commit: function () {
    var self = this;

    self.db._execute("END TRANSACTION");
    self.committed = true;
    self.closed = true;
  }
});

var Db = function (dbFile, options) {
  var self = this;

  self._dbFile = dbFile;

  self._autoPrepare = true;
  self._prepared = {};

  self._db = self.open(dbFile);

  self._transactionMutex = new Mutex();

  // WAL mode copes much better with (multi-process) concurrency
  self._execute('PRAGMA journal_mode=WAL');
};

_.extend(Db.prototype, {

  // Runs functions serially, in a mutex
  _serialize: function (f) {
    var self = this;

    try {
      self._transactionMutex.lock();
      return f();
    } finally {
      self._transactionMutex.unlock();
    }
  },

  // Runs the function inside a transaction block
  runInTransaction: function (action) {
    var self = this;

    var runOnce = function () {
      var future = new Future();

      var txn = new Txn(self);

      var t1 = Date.now();

      var rollback = true;
      var result = null;
      var resultError = null;

      txn.begin();
      try {
        result = action(txn);
        txn.commit();
      } catch (err) {
        resultError = err;
      } finally {
        try {
          txn.close();
        } catch (e) {
          // We don't have a lot of options here...
          Console.warn("Error closing transaction", e);
        }
      }

      //self._closePreparedStatements();

      if (DEBUG_SQL) {
        var t2 = Date.now();
        // XXX: Hack around not having loggers
        Console.info("Transaction took: ", (t2 - t1));
      }

      if (resultError) {
        future['throw'](resultError);
      } else {
        future['return'](result);
      }
      return future.wait();
    };

    for (var attempt = 0; ; attempt++) {
      try {
        return self._serialize(runOnce);
      } catch (err) {
        var retry = false;
        // Grr... doesn't expose error code; must string-match
        if (err.message
            && (   err.message == "SQLITE_BUSY: database is locked"
                || err.message == "SQLITE_BUSY: cannot commit transaction - SQL statements in progress")) {
          if (attempt < BUSY_RETRY_ATTEMPTS) {
            retry = true;
          }
        }
        if (!retry) {
          throw err;
        }
      }

      // Wait on average BUSY_RETRY_INTERVAL, but randomize to avoid thundering herd
      var t = (Math.random() + 0.5) * BUSY_RETRY_INTERVAL;
      utils.sleepMs(t);
    }
  },

  open: function (dbFile) {
    var self = this;

    if ( !fs.existsSync(path.dirname(dbFile)) ) {
      var folder = path.dirname(dbFile);
      if ( !files.mkdir_p(folder) )
        throw new Error("Could not create folder at " + folder);
    }

    Console.debug("Opening db file", dbFile);
    return new sqlite3.Database(dbFile);
  },

  // Runs a query synchronously, returning all rows
  // Hidden to enforce transaction usage
  _query: function (sql, params) {
    var self = this;

    var prepared = null;
    var prepare = self._autoPrepare;
    if (prepare) {
      prepared = self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    var future = new Future();

    //Console.debug("Executing SQL ", sql, params);

    var callback = function (err, rows) {
      if (err) {
        future['throw'](err);
      } else {
        future['return'](rows);
      }
    };

    if (prepared) {
      prepared.all(params, callback);
    } else {
      self._db.all(sql, params, callback);
    }

    var ret = future.wait();

    if (DEBUG_SQL) {
      var t2 = Date.now();
      if ((t2 - t1) > 10) {
        // XXX: Hack around not having log levels
        Console.info("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return ret;
  },

  // Runs a query synchronously, returning no rows
  // Hidden to enforce transaction usage
  _execute: function (sql, params) {
    var self = this;

    var prepared = null;
    var prepare = self._autoPrepare;
    if (prepare &&
        (sql.indexOf("PRAGMA ") === 0 || sql.indexOf("BEGIN ") === 0 || sql.indexOf("END ") === 0 || sql.indexOf("ROLLBACK ") === 0)) {
      //Console.debug("Not preparing PRAGMA/BEGIN/END/ROLLBACK command", sql);
      prepare = false;
    }
    if (prepare) {
      prepared = self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    var future = new Future();

    //Console.debug("Executing SQL ", sql, params);

    var callback = function (err) {
      if (err) {
        future['throw'](err);
      } else {
        // Yes, lastID & changes are on this(!)
        future['return']({ lastID: this.lastID, changes: this.changes });
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
        Console.info("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return ret;
  },

  // Prepares the statement, caching the result
  _prepareWithCache: function (sql) {
    var self = this;

    var prepared = self._prepared[sql];
    if (!prepared) {
      //Console.debug("Preparing statement: ", sql);
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
  },


  // Close any cached prepared statements
  _closePreparedStatements: function () {
    var self = this;

    var prepared = self._prepared;
    self._prepared = {};

    _.each(prepared, function (statement) {
      var future = new Future();
      statement.finalize(function (err) {
        // We return, not throw it, because we don't want to throw
        future['return'](err);
      });
      var err = future.wait();
      if (err) {
        Console.warn("Error finalizing statement ", err);
      }
    });
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
        var deleteResults = txn.execute(self._deleteQuery, [ id ]);
        if (deleteResults.changes !== 1) {
          throw new Error("Unable to delete row: " + id);
        }
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
  toString: function () {
    var self = this;
    return "RemoteCatalog [options=" + JSON.stringify(self.options) + "]";
  },

  getVersion: function (name, version) {
    var result = this._queryAsJSON("SELECT content FROM versions WHERE packageName=? AND version=?", [name, version]);
    if(!result || result.length === 0) {
      return null;
    }
    return result[0];
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;

    var versions = self.getSortedVersions(name);
    versions.reverse();
    return self.getVersion(name, versions[0]);
  },

  getSortedVersions: function (name) {
    var self = this;
    var match = this._getPackageVersions(name);
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

  getPackage: function (name, options) {
    var result = this._queryAsJSON("SELECT * FROM packages WHERE name=?", name);
    if (!result || result.length === 0)
      return null;
    if (result.length !== 1) {
      throw new Error("Found multiple packages matching name: " + name);
    }
    return result[0];
  },

  _getPackageVersions: function (name) {
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

    Console.debug("In remote catalog refresh");

    buildmessage.assertInCapture();
    if (self.offline)
      return;

    if (options.maxAge) {
      var lastSync = self.getMetadata(METADATA_LAST_SYNC);
      Console.debug("lastSync = ", lastSync);
      if (lastSync && lastSync.timestamp) {
        if ((Date.now() - lastSync.timestamp) < options.maxAge) {
          Console.info("Catalog is sufficiently up-to-date; not refreshing\n");
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
    if (updateResult.connectionFailed) {
      Console.warn("Warning: could not connect to package server\n");
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
    var matchingBuilds = this._queryAsJSON(
      "SELECT content FROM builds WHERE versionId=?", versionRecord._id);
    return _.findWhere(matchingBuilds, { buildArchitectures: buildArchitectures });
  },

  isLocalPackage: function() {
    return false;
  },

  _queryWithRetry: function (query, params, options) {
    var self = this;
    options = options || {};

    var rows = self.db.runInTransaction(function (txn) {
      return txn.query(query, params);
    });
    if (rows.length !== 0 || options.noRefresh)
      return rows;

    // XXX: This causes unnecessary refreshes

    // XXX: It would be nice to Console.warn this, but that breaks some of our self-tests
    Console.debug("Forcing refresh because of unexpected missing data");
    Console.debug("No data was returned from query: ", query, params);
    self.refresh();

    options = _.clone(options);
    options.noRefresh = true;

    return self._queryWithRetry(query, params, options);
  },


  // Execute a query using the values as arguments of the query and return the result as JSON.
  // This code assumes that the table being queried always have a column called "content"
  _queryAsJSON: function (query, params, options) {
    var self = this;
    Console.debug("Executing query with _queryAsJSON: ", query, params);
    var rows = self._queryWithRetry(query, params, options);
    return _.map(rows, function(entity) {
      return JSON.parse(entity.content);
    });
  },

  // Executes a query, parsing the content column as JSON
  // No refreshes
  _simpleQuery: function (query, params) {
    var self = this;
    var rows = self.db.runInTransaction(function (txn) {
      return txn.query(query, params);
    });
    return _.map(rows, function(entity) {
      return JSON.parse(entity.content);
    });
  },

  // XXX: Remove this; it is only here for the tests, and that is a hack
  _insertReleaseVersions: function(releaseVersions) {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      self.tableReleaseVersions.upsert(txn, releaseVersions);
    });
  },

  //Given data from troposphere, add it into the local store
  insertData: function(serverData, syncComplete) {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      self.tablePackages.upsert(txn, serverData.collections.packages);
      self.tableBuilds.upsert(txn, serverData.collections.builds);
      self.tableVersions.upsert(txn, serverData.collections.versions);
      self.tableReleaseTracks.upsert(txn, serverData.collections.releaseTracks);
      self.tableReleaseVersions.upsert(txn, serverData.collections.releaseVersions);

      var syncToken = serverData.syncToken;
      Console.debug("Adding syncToken: ", JSON.stringify(syncToken));
      syncToken._id = SYNCTOKEN_ID; //Add fake _id so it fits the pattern
      self.tableSyncToken.upsert(txn, [syncToken]);

      if (syncComplete) {
        var lastSync = {timestamp: Date.now()};
        self._setMetadata(txn, METADATA_LAST_SYNC, lastSync);
      }
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
    var result = self._simpleQuery("SELECT content FROM syncToken WHERE _id=?", [ SYNCTOKEN_ID ]);
    if (!result || result.length === 0) {
      Console.debug("No sync token found");
      return null;
    }
    if (result.length !== 1) {
      throw new Error("Unexpected number of sync tokens found");
    }
    delete result[0]._id;
    Console.debug("Returning sync token: " + JSON.stringify(result[0]));
    return result[0];
  },

  getMetadata: function(key) {
    var self = this;
    var row = self.db.runInTransaction(function (txn) {
      return self.tableMetadata.find(txn, key);
    });
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
