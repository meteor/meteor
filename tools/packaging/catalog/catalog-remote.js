var _ = require('underscore');
var sqlite3 = require('sqlite3');

var files = require('../../fs/files');
var utils = require('../../utils/utils.js');
var buildmessage = require('../../utils/buildmessage.js');
var config = require('../../meteor-services/config.js');
var archinfo = require('../../utils/archinfo');
var Console = require('../../console/console.js').Console;

var tropohouse = require('../tropohouse.js');
var packageClient = require('../package-client.js');
var VersionParser = require('../package-version-parser.js');
var Profile = require('../../tool-env/profile').Profile;

// XXX: Rationalize these flags.  Maybe use the logger?
var DEBUG_SQL = !!process.env.METEOR_DEBUG_SQL;

// Developers using Windows Subsystem for Linux (WSL) may want to override
// this environment variable to TRUNCATE instead of WAL. WAL mode copes
// better with (multi-process) concurrency but is currently incompatible
// with WSL: https://github.com/meteor/meteor-feature-requests/issues/154
const JOURNAL_MODE =
  process.env.METEOR_SQLITE_JOURNAL_MODE || "WAL";

var SYNCTOKEN_ID = "1";

var METADATA_LAST_SYNC = "lastsync";

var BUSY_RETRY_ATTEMPTS = 10;
var BUSY_RETRY_INTERVAL = 1000;

var Mutex = function () {
  var self = this;

  self._locked = false;

  self._resolvers = [];
};

Object.assign(Mutex.prototype, {
  lock: async function () {
    var self = this;

    while (true) {
      if (!self._locked) {
        self._locked = true;
        return;
      }

      await new Promise(function (resolve) {
        self._resolvers.push(resolve);
      });
    }
  },

  unlock: async function () {
    var self = this;

    if (!self._locked) {
      throw new Error("unlock called on unlocked mutex");
    }

    self._locked = false;
    var resolve = self._resolvers.shift();
    if (resolve) {
      await resolve();
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

Object.assign(Txn.prototype, {
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
  begin: async function (mode) {
    var self = this;

    // XXX: Use DEFERRED mode?
    mode = mode || "IMMEDIATE";

    if (self.started) {
      throw new Error("Transaction already started");
    }

    await self.db._execute("BEGIN " + mode + " TRANSACTION");
    self.started = true;
  },

  // Releases resources from the transaction; Rollback if commit not already called.
  close: async function () {
    var self = this;

    if (self.closed) {
      return;
    }

    if (!self.started) {
      return;
    }

    await self.db._execute("ROLLBACK TRANSACTION");
    self.committed = false;
    self.closed = true;
  },

  // Commits the transaction.  close() will then be a no-op
  commit: async function () {
    var self = this;

    await self.db._execute("END TRANSACTION");
    self.committed = true;
    self.closed = true;
  }
});

var Db = function (dbFile, options) {
  var self = this;

  self._dbFile = dbFile;

  self._autoPrepare = true;
  self._prepared = {};

  self._transactionMutex = new Mutex();
};

Object.assign(Db.prototype, {
  init: async function() {
    const self = this;
    self._db = await self._retry(function () {
      return self.open(self._dbFile);
    });

    await self._retry(function () {
      return self._execute(`PRAGMA journal_mode=${JOURNAL_MODE}`);
    });
  },
  // TODO: Move to utils?
  _retry: async function (f, options) {
    options = Object.assign({ maxAttempts: 3, delay: 500}, options || {});

    for (var attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await f();
      } catch (err) {
        if (attempt < options.maxAttempts) {
          Console.warn("Retrying after error", err);
        } else {
          throw err;
        }
      }

      if (options.delay) {
        await utils.sleepMs(options.delay);
      }
    }
  },

  // Runs functions serially, in a mutex
  _serialize: async function (f) {
    var self = this;

    try {
      await self._transactionMutex.lock();
      return await f();
    } finally {
      await self._transactionMutex.unlock();
    }
  },

  // Do not call any other methods on this object after calling this one.
  // This yields.
  closePermanently: async function () {
    var self = this;
    await self._closePreparedStatements();
    var db = self._db;
    self._db = null;
    await new Promise((resolve, reject) => {
      db.close(err => err ? reject(err) : resolve());
    });
  },

  // Runs the function inside a transaction block
  runInTransaction: async function (action) {
    var self = this;

    var runOnce = Profile("sqlite query", async function () {
      var txn = new Txn(self);

      var t1 = Date.now();

      var rollback = true;
      var result = null;
      var resultError = null;

      await txn.begin();
      try {
        result = await action(txn);
        await txn.commit();
      } catch (err) {
        resultError = err;
      } finally {
        try {
          await txn.close();
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
        throw resultError;
      }

      return result;
    });

    for (var attempt = 0; ; attempt++) {
      try {
        return await self._serialize(runOnce);
      } catch (err) {
        var retry = false;
        // Grr... doesn't expose error code; must string-match
        if (err.message &&
            (err.message === "SQLITE_BUSY: database is locked" ||
             err.message === "SQLITE_BUSY: cannot commit transaction - SQL statements in progress")) {
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
      await utils.sleepMs(t);
    }
  },

  open: function (dbFile) {
    var self = this;

    if ( !files.exists(files.pathDirname(dbFile)) ) {
      Console.debug("Creating database directory", dbFile);

      var folder = files.pathDirname(dbFile);
      if ( !files.mkdir_p(folder) )
        throw new Error("Could not create folder at " + folder);
    }

    Console.debug("Opening db file", dbFile);
    return new sqlite3.Database(files.convertToOSPath(dbFile));
  },

  // Runs a query synchronously, returning all rows
  // Hidden to enforce transaction usage
  _query: async function (sql, params) {
    var self = this;

    var prepared = null;
    var prepare = self._autoPrepare && !_.isEmpty(params);
    if (prepare) {
      prepared = await self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    //Console.debug("Executing SQL ", sql, params);

    var rows = await new Promise((resolve, reject) => {
      function callback(err, rows) {
        err ? reject(err) : resolve(rows);
      }

      if (prepared) {
        prepared.all(params, callback);
      } else {
        self._db.all(sql, params, callback);
      }
    });

    if (DEBUG_SQL) {
      var t2 = Date.now();
      if ((t2 - t1) > 10) {
        // XXX: Hack around not having log levels
        Console.info("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return rows;
  },

  // Runs a query, returning no rows
  // Hidden to enforce transaction usage
  _execute: async function (sql, params) {
    var self = this;

    var prepared = null;
    // We don't prepare non-parametrized statements, because (a) there's not
    // that much of a win from doing so, since we don't tend to run them in bulk
    // and (b) doing so can trigger
    // https://github.com/mapbox/node-sqlite3/pull/355 .  (We can avoid that bug
    // by being careful to pass in an empty array or no argument for params to
    // prepared.run instead of undefined, but we can also just avoid the issue
    // entirely.)
    var prepare = self._autoPrepare && !_.isEmpty(params);
    if (prepare) {
      prepared = await self._prepareWithCache(sql);
    }

    if (DEBUG_SQL) {
      var t1 = Date.now();
    }

    //Console.debug("Executing SQL ", sql, params);

    var ret = await new Promise(function (resolve, reject) {
      function callback(err) {
        err ? reject(err) : resolve({
          // Yes, lastID & changes are on this(!)
          lastID: this.lastID,
          changes: this.changes
        });
      }

      if (prepared) {
        prepared.run(params, callback);
      } else {
        self._db.run(sql, params, callback);
      }
    });

    if (DEBUG_SQL) {
      var t2 = Date.now();
      if ((t2 - t1) > 10) {
        Console.info("SQL statement ", sql, " took ", (t2 - t1));
      }
    }

    return ret;
  },

  // Prepares the statement, caching the result
  _prepareWithCache: async function (sql) {
    var self = this;

    var prepared = self._prepared[sql];
    if (!prepared) {
      //Console.debug("Preparing statement: ", sql);
      await new Promise(function (resolve, reject) {
        prepared = self._db.prepare(sql, function (err) {
          err ? reject(err) : resolve();
        });
      });

      self._prepared[sql] = prepared;
    }

    return prepared;
  },


  // Close any cached prepared statements
  _closePreparedStatements: async function () {
    var self = this;

    var prepared = self._prepared;
    self._prepared = {};

    for (const statement of Object.values(prepared)) {
      var err = await new Promise(function (resolve) {
        // We resolve the promise with an error instead of rejecting it,
        // because we don't want to throw.
        statement.finalize(resolve);
      });

      if (err) {
        Console.warn("Error finalizing statement ", err);
      }
    }
  }
});


var Table = function (name, jsonFields, options) {
  var self = this;
  options = options || {};

  self.name = name;
  self.jsonFields = jsonFields;
  self.noContentColumn = options.noContentColumn;

  self._buildStatements();
};

Object.assign(Table.prototype, {
  _buildStatements: function () {
    var self = this;

    var queryParams = self._generateQuestionMarks(
      self.jsonFields.length + (self.noContentColumn ? 0 : 1));
    self._selectQuery = "SELECT * FROM " + self.name + " WHERE _id=?";
    self._insertQuery = "INSERT INTO " + self.name + " VALUES " + queryParams;
    self._deleteQuery = "DELETE FROM " + self.name + " WHERE _id=?";
  },

  // Generate a string of the form (?, ?) where the n is the number of question
  // mark.
  _generateQuestionMarks: function (n) {
    return "(" + _.times(n, function () { return "?" }).join(",") + ")";
  },

  find: async function (txn, id) {
    var self = this;
    var rows = await txn.query(self._selectQuery, [ id ]);
    if (rows.length !== 0) {
      if (rows.length !== 1) {
        throw new Error("Corrupt database (PK violation)");
      }
      return rows[0];
    }
    return undefined;
  },

  upsert: async function (txn, objects) {
    var self = this;

    // XXX: Use sqlite upsert
    // XXX: Speculative insert
    // XXX: Fix transaction logic so we always roll back
    for (const o of objects) {
      var id = o._id;
      var rows = await txn.query(self._selectQuery, [ id ]);
      if (rows.length !== 0) {
        var deleteResults = await txn.execute(self._deleteQuery, [ id ]);
        if (deleteResults.changes !== 1) {
          throw new Error("Unable to delete row: " + id);
        }
      }
      var row = [];
      _.each(self.jsonFields, function (jsonField) {
        row.push(o[jsonField]);
      });
      if (! self.noContentColumn) {
        row.push(JSON.stringify(o));
      }
      await txn.execute(self._insertQuery, row);
    }
  },

  createTable: async function (txn) {
    var self = this;

    var sql = 'CREATE TABLE IF NOT EXISTS ' + self.name + '(';
    for (var i = 0; i < self.jsonFields.length; i++) {
      var jsonField = self.jsonFields[i];
      var sqlColumn = jsonField;
      if (i != 0) sql += ", ";
      sql += sqlColumn + " STRING";
      if (sqlColumn === '_id') {
        sql += " PRIMARY KEY";
      }
    }
    if (! self.noContentColumn) {
      sql += ", content STRING";
    }
    sql += ")";
    await txn.execute(sql);

    //sql = "CREATE INDEX IF NOT EXISTS idx_" + self.name + "_id ON " + self.name + "(_id)";
    //txn.execute(sql);
  }
});


// A RemoteCatalog is a local cache of the content of troposphere.
// A default instance of this catalog is registered by the layered catalog and is available
// under the variable "official" from the catalog.js
//
// The remote catalog is backed by a db to make things easier on the memory and for faster queries
var RemoteCatalog = function () {
  var self = this;

  // Set this to true if we are not going to connect to the remote package
  // server, and will only use the cached data for our package information
  // This means that the catalog might be out of date on the latest developments.
  self.offline = null;

  self.db = null;
};

Object.assign(RemoteCatalog.prototype, {
  toString: function () {
    var self = this;
    return "RemoteCatalog";
  },

  // Used for special cases that want to ensure that all connections to the DB
  // are closed (eg to ensure that all writes have been flushed from the '-wal'
  // file to the main DB file). Most methods on this class will stop working
  // after you call this method. Note that this yields.
  closePermanently: async function () {
    var self = this;
    await self.db.closePermanently();
    self.db = null;
  },

  getVersion: async function (packageName, version) {
    var result = await this._contentQuery(
      "SELECT content FROM versions WHERE packageName=? AND version=?",
      [packageName, version]);
    return filterExactRows(result, { packageName, version });
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: async function (name) {
    var self = this;

    var versions = await self.getSortedVersions(name);
    return await self.getVersion(name, _.last(versions));
  },

  getSortedVersions: async function (name) {
    var self = this;
    var match = await this._columnsQuery(
      "SELECT version FROM versions WHERE packageName=?", name);
    if (match === null)
      return [];
    var pvParse = _.memoize(VersionParser.parse);
    return _.pluck(match, 'version').sort(function (a, b) {
      return VersionParser.compare(pvParse(a), pvParse(b));
    });
  },

  // Just getVersion mapped over getSortedVersions, but only makes one round
  // trip to sqlite.
  getSortedVersionRecords: async function (name) {
    var self = this;
    var versionRecords = await this._contentQuery(
      "SELECT content FROM versions WHERE packageName=?", [name]);
    if (! versionRecords)
      return [];

    var pvParse = _.memoize(VersionParser.parse);
    versionRecords.sort(function (a, b) {
      return VersionParser.compare(pvParse(a.version),
                                   pvParse(b.version));
    });
    return versionRecords;
  },

  getLatestMainlineVersion: async function (name) {
    var self = this;
    var versions = await self.getSortedVersions(name);
    versions.reverse();
    var latest = _.find(versions, function (version) {
      return !/-/.test(version);
    });
    if (!latest)
      return null;
    return await self.getVersion(name, latest);
  },

  getPackage: async function (name) {
    var result = await this._contentQuery(
      "SELECT content FROM packages WHERE name=?", name);
    if (!result || result.length === 0)
      return null;
    if (result.length !== 1) {
      throw new Error("Found multiple packages matching name: " + name);
    }
    return result[0];
  },

  getAllBuilds: async function (name, version) {
    var result = await this._contentQuery(
      "SELECT content FROM builds WHERE builds.versionId = " +
        "(SELECT _id FROM versions WHERE versions.packageName=? AND " +
        "versions.version=?)",
      [name, version]);
    if (!result || result.length === 0)
      return null;
    return result;
  },

  // If this package has any builds at this version, return an array of builds
  // which cover all of the required arches, or null if it is impossible to
  // cover them all (or if the version does not exist).
  // Note that this method is specific to RemoteCatalog.
  getBuildsForArches: async function (name, version, arches) {
    var self = this;

    var solution = null;
    var allBuilds = await self.getAllBuilds(name, version) || [];

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

  filterArchesWithBuilds: async function (name, version, arches) {
    const buildArches = [];

    for (const arch of arches) {
      if (await this.getBuildsForArches(name, version, [arch])) {
        buildArches.push(arch);
      }
    }
    return buildArches;
  },

  // Returns general (non-version-specific) information about a
  // release track, or null if there is no such release track.
  getReleaseTrack: async function (name) {
    var self = this;
    var result = await self._contentQuery(
      "SELECT content FROM releaseTracks WHERE name=?", name);
    return filterExactRows(result, { name });
  },

  getReleaseVersion: async function (track, version) {
    var self = this;
    var result = await self._contentQuery(
      "SELECT content FROM releaseVersions WHERE track=? AND version=?",
      [track, version]);
    return filterExactRows(result, { track, version });
  },

  // Used by make-bootstrap-tarballs. Only should be used on catalogs that are
  // specially constructed for bootstrap tarballs.
  forceRecommendRelease: async function (track, version) {
    var self = this;
    var releaseVersionData = await self.getReleaseVersion(track, version);
    if (!releaseVersionData) {
      throw Error("Can't force-recommend unknown release " + track + "@"
                  + version);
    }
    releaseVersionData.recommended = true;
    await self._insertReleaseVersions([releaseVersionData]);
  },

  getAllReleaseTracks: async function () {
    const result = await this._columnsQuery("SELECT name FROM releaseTracks");

    return result.map(({name}) => name);
  },

  getAllPackageNames: async function () {
    const results = await this._columnsQuery("SELECT name FROM packages");

    return results.map(({name}) => name);
  },

  initialize: async function (options) {
    var self = this;

    options = options || {};
    // We should to figure out if we are intending to connect to the package server.
    self.offline = options.offline ? options.offline : false;

    var dbFile = options.packageStorage || config.getPackageStorage();
    self.db = new Db(dbFile);

    await self.db.init();

    self.tableVersions = new Table('versions', ['packageName', 'version', '_id']);
    self.tableBuilds = new Table('builds', ['versionId', '_id']);
    self.tableReleaseTracks = new Table('releaseTracks', ['name', '_id']);
    self.tableReleaseVersions = new Table('releaseVersions', ['track', 'version', '_id']);
    self.tablePackages = new Table('packages', ['name', '_id']);
    self.tableSyncToken = new Table('syncToken', ['_id']);
    self.tableMetadata = new Table('metadata', ['_id']);
    self.tableBannersShown = new Table(
      'bannersShown', ['_id', 'lastShown'], { noContentColumn: true });

    self.allTables = [
      self.tableVersions,
      self.tableBuilds,
      self.tableReleaseTracks,
      self.tableReleaseVersions,
      self.tablePackages,
      self.tableSyncToken,
      self.tableMetadata,
      self.tableBannersShown
    ];
    return self.db.runInTransaction(async function(txn) {
      for (const table of self.allTables) {
        await table.createTable(txn);
      }

      // Extra indexes for the most expensive queries
      // These are non-unique indexes
      // XXX We used to have a versionsNamesIdx here on versions(packageName);
      //     we no longer create it but we don't waste time dropping it either.
      await txn.execute("CREATE INDEX IF NOT EXISTS versionsIdx ON " +
                  "versions(packageName, version)");
      await txn.execute("CREATE INDEX IF NOT EXISTS buildsVersionsIdx ON " +
                  "builds(versionId)");
      await txn.execute("CREATE INDEX IF NOT EXISTS packagesIdx ON " +
                  "packages(name)");
      await txn.execute("CREATE INDEX IF NOT EXISTS releaseTracksIdx ON " +
                  "releaseTracks(name)");
      await txn.execute("CREATE INDEX IF NOT EXISTS releaseVersionsIdx ON " +
                  "releaseVersions(track, version)");
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

  refresh: async function (options) {
    var self = this;
    options = options || {};

    Console.debug("In remote catalog refresh");

    if (process.env.METEOR_TEST_FAIL_RELEASE_DOWNLOAD === 'offline') {
      var e = new Error;
      e.errorType = 'DDP.ConnectionError';
      throw e;
    }

    if (self.offline)
      return false;

    if (options.maxAge) {
      var lastSync = await self.getMetadata(METADATA_LAST_SYNC);
      Console.debug("lastSync = ", lastSync);
      if (lastSync && lastSync.timestamp) {
        if ((Date.now() - lastSync.timestamp) < options.maxAge) {
          Console.debug("Package catalog is sufficiently up-to-date; not updating\n");
          return false;
        }
      }
    }

    var updateResult = {};
    // XXX This buildmessage.enterJob only exists for showing progress.
    await buildmessage.enterJob({ title: 'updating package catalog' }, async function () {
      updateResult = await packageClient.updateServerPackageData(self);
    });

    if (updateResult.resetData) {
      await tropohouse.default.wipeAllPackages();
    }

    return true;
  },

  // Given a release track, returns all recommended versions for this track,
  // sorted by their orderKey. Returns the empty array if the release track does
  // not exist or does not have any recommended versions.
  getSortedRecommendedReleaseVersions: async function (track, laterThanOrderKey) {
    var self = this;
    var versions =
          await self.getSortedRecommendedReleaseRecords(track, laterThanOrderKey);
    return _.pluck(versions, "version");
  },

  // Given a release track, returns all recommended version *records* for this
  // track, sorted by their orderKey. Returns the empty array if the release
  // track does not exist or does not have any recommended versions.
  getSortedRecommendedReleaseRecords: async function (track, laterThanOrderKey) {
    var self = this;
    // XXX releaseVersions content objects are kinda big; if we put
    // 'recommended' and 'orderKey' in their own columns this could be faster
    var result = await self._contentQuery(
      "SELECT content FROM releaseVersions WHERE track=?", track);

    var recommended = _.filter(result, function (v) {
      if (!v.recommended)
        return false;
      return !laterThanOrderKey || v.orderKey > laterThanOrderKey;
    });

    var recSort = _.sortBy(recommended, function (rec) {
      return rec.orderKey;
    });
    recSort.reverse();
    return recSort;
  },

  // Given a release track, returns all version records for this track.
  getReleaseVersionRecords: async function (track) {
    var self = this;
    var result = await self._contentQuery(
      "SELECT content FROM releaseVersions WHERE track=?", track);
    return result;
  },

  // For a given track, returns the total number of release versions on that
  // track.
  getNumReleaseVersions: async function (track) {
    var self = this;
    var result = await self._columnsQuery(
      "SELECT count(*) FROM releaseVersions WHERE track=?", track);
    return result[0]["count(*)"];
  },

  // Returns the default release version on the DEFAULT_TRACK, or for a
  // given release track.
  getDefaultReleaseVersion: async function (track) {
    var self = this;
    var versionRecord = await self.getDefaultReleaseVersionRecord(track);
    if (! versionRecord)
      throw new Error("Can't get default release version for track " + track);
    return _.pick(versionRecord, ["track", "version" ]);
  },

  // Returns the default release version record for the DEFAULT_TRACK, or for a
  // given release track.
  getDefaultReleaseVersionRecord: async function (track) {
    var self = this;

    if (!track)
      track = exports.DEFAULT_TRACK;

    var versions = await self.getSortedRecommendedReleaseRecords(track);
    if (!versions.length)
      return null;
    return  versions[0];
  },

  getBuildWithPreciseBuildArchitectures: async function (versionRecord, buildArchitectures) {
    var self = this;
    var matchingBuilds = await this._contentQuery(
      "SELECT content FROM builds WHERE versionId=?", versionRecord._id);
    return _.findWhere(matchingBuilds, { buildArchitectures: buildArchitectures });
  },

  // Executes a query, returning an array of each content column parsed as JSON
  _contentQuery: async function (query, params) {
    var self = this;
    var rows = await self._columnsQuery(query, params);
    return _.map(rows, function(entity) {
      return JSON.parse(entity.content);
    });
  },

  // Executes a query, returning an array of maps from column name to data.
  // No JSON parsing is performed.
  _columnsQuery: async function (query, params) {
    var self = this;
    var rows = await self.db.runInTransaction(function (txn) {
      return txn.query(query, params);
    });
    return rows;
  },

  _insertReleaseVersions: function(releaseVersions) {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      return self.tableReleaseVersions.upsert(txn, releaseVersions);
    });
  },

  //Given data from troposphere, add it into the local store
  insertData: function(serverData, syncComplete) {
    var self = this;
    return self.db.runInTransaction(async function (txn) {
      await self.tablePackages.upsert(txn, serverData.collections.packages);
      await self.tableBuilds.upsert(txn, serverData.collections.builds);
      await self.tableVersions.upsert(txn, serverData.collections.versions);
      await self.tableReleaseTracks.upsert(txn, serverData.collections.releaseTracks);
      await self.tableReleaseVersions.upsert(txn, serverData.collections.releaseVersions);

      var syncToken = serverData.syncToken;
      Console.debug("Adding syncToken: ", JSON.stringify(syncToken));
      syncToken._id = SYNCTOKEN_ID; //Add fake _id so it fits the pattern
      await self.tableSyncToken.upsert(txn, [syncToken]);

      if (syncComplete) {
        var lastSync = {timestamp: Date.now()};
        await self._setMetadata(txn, METADATA_LAST_SYNC, lastSync);
      }
    });
  },

  getSyncToken: async function() {
    var self = this;
    var result = await self._contentQuery("SELECT content FROM syncToken WHERE _id=?",
                                    [ SYNCTOKEN_ID ]);
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

  getMetadata: async function(key) {
    var self = this;
    var row = await self.db.runInTransaction(function (txn) {
      return self.tableMetadata.find(txn, key);
    });
    if (row) {
      return JSON.parse(row['content']);
    }
    return undefined;
  },

  setMetadata: async function(key, value) {
    var self = this;
    await self.db.runInTransaction(function (txn) {
      return self._setMetadata(txn, key, value);
    });
  },

  _setMetadata: async function(txn, key, value) {
    var self = this;
    value._id = key;
    await self.tableMetadata.upsert(txn, [value]);
  },

  shouldShowBanner: async function (releaseName, bannerDate) {
    var self = this;
    var row = await self.db.runInTransaction(function (txn) {
      return self.tableBannersShown.find(txn, releaseName);
    });
    // We've never printed a banner for this release.
    if (! row)
      return true;
    try {
      var lastShown = new Date(JSON.parse(row.lastShown));
      return lastShown < bannerDate;
    } catch (e) {
      // Probably an error in JSON.parse or something. Just show the banner.
      return true;
    }
  },

  setBannerShownDate: async function (releaseName, bannerShownDate) {
    var self = this;
    return self.db.runInTransaction(function (txn) {
      return self.tableBannersShown.upsert(txn, [{
        _id: releaseName,
        // XXX For now, there's no way to tell this file to make a non-string
        // column in a sqlite table, but this should probably change to a
        // 'timestamp with time zone' or whatever.
        lastShown: JSON.stringify(bannerShownDate)
      }]);
    });
  }
});

// SQLite has a bizarre philosophy about automaticaly converting between
// different data types, such as strings and floating point numbers:
// https://www.sqlite.org/quirks.html#flexible_typing
//
// This means querying for the string "1.10" in a given column can return
// rows where the column is actually the string "1.1", since SQLite thinks
// you might be talking about the number 1.1 rather than the string you
// actually requested.
//
// This "feature" first became a problem for Meteor after we published
// Meteor 1.10, which caused SQLite to return multiple rows for the
// getReleaseVersion query, including both 1.10 and 1.1.1 (ancient).
//
// While this policy seems completely indefensible, the SQLite project
// does not consider it a bug, which forces us to work around it by
// double-checking the queried results with this helper function:
function filterExactRows(rows, requirements) {
  const keys = Object.keys(requirements);
  return rows && rows.filter(row => {
    return keys.every(key => row[key] === requirements[key]);
  })[0] || null;
}

exports.RemoteCatalog = RemoteCatalog;

// We put this constant here because we don't have any better place that would otherwise cause a cycle
exports.DEFAULT_TRACK = 'METEOR';

// The catalog as provided by troposhere (aka atomospherejs.com)
exports.official = new RemoteCatalog();
