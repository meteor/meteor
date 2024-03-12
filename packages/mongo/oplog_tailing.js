import { NpmModuleMongodb } from "meteor/npm-mongo";
const { Long } = NpmModuleMongodb;

OPLOG_COLLECTION = 'oplog.rs';

var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
var TAIL_TIMEOUT = +process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000;

idForOp = function (op) {
  if (op.op === 'd')
    return op.o._id;
  else if (op.op === 'i')
    return op.o._id;
  else if (op.op === 'u')
    return op.o2._id;
  else if (op.op === 'c')
    throw Error("Operator 'c' doesn't supply an object with id: " +
                EJSON.stringify(op));
  else
    throw Error("Unknown op: " + EJSON.stringify(op));
};

OplogHandle = function (oplogUrl, dbName) {
  var self = this;
  self._oplogUrl = oplogUrl;
  self._dbName = dbName;

  self._oplogLastEntryConnection = null;
  self._oplogTailConnection = null;
  self._stopped = false;
  self._tailHandle = null;
  self._readyPromiseResolver = null;
  self._readyPromise = new Promise(r => self._readyPromiseResolver = r);
  self._crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata", factName: "oplog-watchers"
  });
  self._baseOplogSelector = {
    ns: new RegExp("^(?:" + [
      Meteor._escapeRegExp(self._dbName + "."),
      Meteor._escapeRegExp("admin.$cmd"),
    ].join("|") + ")"),

    $or: [
      { op: { $in: ['i', 'u', 'd'] } },
      // drop collection
      { op: 'c', 'o.drop': { $exists: true } },
      { op: 'c', 'o.dropDatabase': 1 },
      { op: 'c', 'o.applyOps': { $exists: true } },
    ]
  };

  // Data structures to support waitUntilCaughtUp(). Each oplog entry has a
  // MongoTimestamp object on it (which is not the same as a Date --- it's a
  // combination of time and an incrementing counter; see
  // http://docs.mongodb.org/manual/reference/bson-types/#timestamps).
  //
  // _catchingUpFutures is an array of {ts: MongoTimestamp, future: Future}
  // objects, sorted by ascending timestamp. _lastProcessedTS is the
  // MongoTimestamp of the last oplog entry we've processed.
  //
  // Each time we call waitUntilCaughtUp, we take a peek at the final oplog
  // entry in the db.  If we've already processed it (ie, it is not greater than
  // _lastProcessedTS), waitUntilCaughtUp immediately returns. Otherwise,
  // waitUntilCaughtUp makes a new Future and inserts it along with the final
  // timestamp entry that it read, into _catchingUpFutures. waitUntilCaughtUp
  // then waits on that future, which is resolved once _lastProcessedTS is
  // incremented to be past its timestamp by the worker fiber.
  //
  // XXX use a priority queue or something else that's faster than an array
  self._catchingUpResolvers = [];
  self._lastProcessedTS = null;

  self._onSkippedEntriesHook = new Hook({
    debugPrintExceptions: "onSkippedEntries callback"
  });

  self._entryQueue = new Meteor._DoubleEndedQueue();
  self._workerActive = false;

  const shouldAwait = self._startTailing();
  //TODO[fibers] Why wait?
};

Object.assign(OplogHandle.prototype, {
  stop: async function () {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;
    if (self._tailHandle)
      await self._tailHandle.stop();
    // XXX should close connections too
  },
  _onOplogEntry: async function(trigger, callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onOplogEntry on stopped handle!");

    // Calling onOplogEntry requires us to wait for the tailing to be ready.
    await self._readyPromise;

    var originalCallback = callback;
    callback = Meteor.bindEnvironment(function (notification) {
      originalCallback(notification);
    }, function (err) {
      Meteor._debug("Error in oplog callback", err);
    });
    var listenHandle = self._crossbar.listen(trigger, callback);
    return {
      stop: async function () {
        await listenHandle.stop();
      }
    };
  },
  onOplogEntry: function (trigger, callback) {
    return this._onOplogEntry(trigger, callback);
  },
  // Register a callback to be invoked any time we skip oplog entries (eg,
  // because we are too far behind).
  onSkippedEntries: function (callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onSkippedEntries on stopped handle!");
    return self._onSkippedEntriesHook.register(callback);
  },

  async _waitUntilCaughtUp() {
    var self = this;
    if (self._stopped)
      throw new Error("Called waitUntilCaughtUp on stopped handle!");

    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to
    // be ready.
    await self._readyPromise;
    var lastEntry;

    while (!self._stopped) {
      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we might
      // find a TS that won't show up in the actual tail stream.
      try {
        lastEntry = await self._oplogLastEntryConnection.findOneAsync(
          OPLOG_COLLECTION,
          self._baseOplogSelector,
          { projection: { ts: 1 }, sort: { $natural: -1 } }
        );
        break;
      } catch (e) {
        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while reading last entry", e);
        await Meteor._sleepForMs(100);
      }
    }

    if (self._stopped)
      return;

    if (!lastEntry) {
      // Really, nothing in the oplog? Well, we've processed everything.
      return;
    }

    var ts = lastEntry.ts;
    if (!ts)
      throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));

    if (self._lastProcessedTS && ts.lessThanOrEqual(self._lastProcessedTS)) {
      // We've already caught up to here.
      return;
    }


    // Insert the future into our list. Almost always, this will be at the end,
    // but it's conceivable that if we fail over from one primary to another,
    // the oplog entries we see will go backwards.
    var insertAfter = self._catchingUpResolvers.length;
    while (insertAfter - 1 > 0 && self._catchingUpResolvers[insertAfter - 1].ts.greaterThan(ts)) {
      insertAfter--;
    }
    let promiseResolver = null;
    const promiseToAwait = new Promise(r => promiseResolver = r);
    self._catchingUpResolvers.splice(insertAfter, 0, {ts: ts, resolver: promiseResolver});
    await promiseToAwait;
  },

  // Calls `callback` once the oplog has been processed up to a point that is
  // roughly "now": specifically, once we've processed all ops that are
  // currently visible.
  // XXX become convinced that this is actually safe even if oplogConnection
  // is some kind of pool
  waitUntilCaughtUp: function () {
    return this._waitUntilCaughtUp();
  },

  _startTailing: async function () {
    var self = this;
    // First, make sure that we're talking to the local database.
    var mongodbUri = Npm.require('mongodb-uri');
    if (mongodbUri.parse(self._oplogUrl).database !== 'local') {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " +
          "a Mongo replica set");
    }

    // We make two separate connections to Mongo. The Node Mongo driver
    // implements a naive round-robin connection pool: each "connection" is a
    // pool of several (5 by default) TCP connections, and each request is
    // rotated through the pools. Tailable cursor queries block on the server
    // until there is some data to return (or until a few seconds have
    // passed). So if the connection pool used for tailing cursors is the same
    // pool used for other queries, the other queries will be delayed by seconds
    // 1/5 of the time.
    //
    // The tail connection will only ever be running a single tail command, so
    // it only needs to make one underlying TCP connection.
    self._oplogTailConnection = new MongoConnection(
        self._oplogUrl, {maxPoolSize: 1});
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    self._oplogLastEntryConnection = new MongoConnection(
        self._oplogUrl, {maxPoolSize: 1});


    // Now, make sure that there actually is a repl set here. If not, oplog
    // tailing won't ever find anything!
    // More on the isMasterDoc
    // https://docs.mongodb.com/manual/reference/command/isMaster/
    const isMasterDoc = await new Promise(function (resolve, reject) {
      self._oplogLastEntryConnection.db
        .admin()
        .command({ ismaster: 1 }, function (err, result) {
          if (err) reject(err);
          else resolve(result);
        });
    });

    if (!(isMasterDoc && isMasterDoc.setName)) {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " +
          "a Mongo replica set");
    }

    // Find the last oplog entry.
    var lastOplogEntry = await self._oplogLastEntryConnection.findOneAsync(
      OPLOG_COLLECTION,
      {},
      { sort: { $natural: -1 }, projection: { ts: 1 } }
    );

    var oplogSelector = Object.assign({}, self._baseOplogSelector);
    if (lastOplogEntry) {
      // Start after the last entry that currently exists.
      oplogSelector.ts = {$gt: lastOplogEntry.ts};
      // If there are any calls to callWhenProcessedLatest before any other
      // oplog entries show up, allow callWhenProcessedLatest to call its
      // callback immediately.
      self._lastProcessedTS = lastOplogEntry.ts;
    }

    var cursorDescription = new CursorDescription(
        OPLOG_COLLECTION, oplogSelector, {tailable: true});

    // Start tailing the oplog.
    //
    // We restart the low-level oplog query every 30 seconds if we didn't get a
    // doc. This is a workaround for #8598: the Node Mongo driver has at least
    // one bug that can lead to query callbacks never getting called (even with
    // an error) when leadership failover occur.
    self._tailHandle = self._oplogTailConnection.tail(
        cursorDescription,
        function (doc) {
          self._entryQueue.push(doc);
          self._maybeStartWorker();
        },
        TAIL_TIMEOUT
    );

    self._readyPromiseResolver();
  },

  _maybeStartWorker: function () {
    var self = this;
    if (self._workerActive) return;
    self._workerActive = true;

    Meteor.defer(async function () {
      // May be called recursively in case of transactions.
      async function handleDoc(doc) {
        if (doc.ns === "admin.$cmd") {
          if (doc.o.applyOps) {
            // This was a successful transaction, so we need to apply the
            // operations that were involved.
            let nextTimestamp = doc.ts;
            for (const op of doc.o.applyOps) {
              // See https://github.com/meteor/meteor/issues/10420.
              if (!op.ts) {
                op.ts = nextTimestamp;
                nextTimestamp = nextTimestamp.add(Long.ONE);
              }
              await handleDoc(op);
            }
            return;
          }
          throw new Error("Unknown command " + EJSON.stringify(doc));
        }

        const trigger = {
          dropCollection: false,
          dropDatabase: false,
          op: doc,
        };

        if (typeof doc.ns === "string" &&
            doc.ns.startsWith(self._dbName + ".")) {
          trigger.collection = doc.ns.slice(self._dbName.length + 1);
        }

        // Is it a special command and the collection name is hidden
        // somewhere in operator?
        if (trigger.collection === "$cmd") {
          if (doc.o.dropDatabase) {
            delete trigger.collection;
            trigger.dropDatabase = true;
          } else if (_.has(doc.o, "drop")) {
            trigger.collection = doc.o.drop;
            trigger.dropCollection = true;
            trigger.id = null;
          } else if ("create" in doc.o && "idIndex" in doc.o) {
            // A collection got implicitly created within a transaction. There's
            // no need to do anything about it.
          } else {
            throw Error("Unknown command " + EJSON.stringify(doc));
          }

        } else {
          // All other ops have an id.
          trigger.id = idForOp(doc);
        }

        await self._crossbar.fire(trigger);
      }

      try {
        while (! self._stopped &&
               ! self._entryQueue.isEmpty()) {
          // Are we too far behind? Just tell our observers that they need to
          // repoll, and drop our queue.
          if (self._entryQueue.length > TOO_FAR_BEHIND) {
            var lastEntry = self._entryQueue.pop();
            self._entryQueue.clear();

            self._onSkippedEntriesHook.each(function (callback) {
              callback();
              return true;
            });

            // Free any waitUntilCaughtUp() calls that were waiting for us to
            // pass something that we just skipped.
            self._setLastProcessedTS(lastEntry.ts);
            continue;
          }

          const doc = self._entryQueue.shift();

          // Fire trigger(s) for this doc.
          await handleDoc(doc);

          // Now that we've processed this operation, process pending
          // sequencers.
          if (doc.ts) {
            self._setLastProcessedTS(doc.ts);
          } else {
            throw Error("oplog entry without ts: " + EJSON.stringify(doc));
          }
        }
      } finally {
        self._workerActive = false;
      }
    });
  },

  _setLastProcessedTS: function (ts) {
    var self = this;
    self._lastProcessedTS = ts;
    while (!_.isEmpty(self._catchingUpResolvers) && self._catchingUpResolvers[0].ts.lessThanOrEqual(self._lastProcessedTS)) {
      var sequencer = self._catchingUpResolvers.shift();
      sequencer.resolver();
    }
  },

  //Methods used on tests to dinamically change TOO_FAR_BEHIND
  _defineTooFarBehind: function(value) {
    TOO_FAR_BEHIND = value;
  },
  _resetTooFarBehind: function() {
    TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
  }
});
