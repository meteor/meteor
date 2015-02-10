var Future = Npm.require('fibers/future');

OPLOG_COLLECTION = 'oplog.rs';

var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
// XXX this is duplicated with accounts_server.js
var quotemeta = function (str) {
    return String(str).replace(/(\W)/g, '\\$1');
};

var showTS = function (ts) {
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";
};

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
  self._readyFuture = new Future();
  self._crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata", factName: "oplog-watchers"
  });
  self._baseOplogSelector = {
    ns: new RegExp('^' + quotemeta(self._dbName) + '\\.'),
    $or: [
      { op: {$in: ['i', 'u', 'd']} },
      // If it is not db.collection.drop(), ignore it
      { op: 'c', 'o.drop': { $exists: true } }]
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
  self._catchingUpFutures = [];
  self._lastProcessedTS = null;

  self._onSkippedEntriesHook = new Hook({
    debugPrintExceptions: "onSkippedEntries callback"
  });

  self._entryQueue = new Meteor._DoubleEndedQueue();
  self._workerActive = false;

  self._startTailing();
};

_.extend(OplogHandle.prototype, {
  stop: function () {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;
    if (self._tailHandle)
      self._tailHandle.stop();
    // XXX should close connections too
  },
  onOplogEntry: function (trigger, callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onOplogEntry on stopped handle!");

    // Calling onOplogEntry requires us to wait for the tailing to be ready.
    self._readyFuture.wait();

    var originalCallback = callback;
    callback = Meteor.bindEnvironment(function (notification) {
      // XXX can we avoid this clone by making oplog.js careful?
      originalCallback(EJSON.clone(notification));
    }, function (err) {
      Meteor._debug("Error in oplog callback", err.stack);
    });
    var listenHandle = self._crossbar.listen(trigger, callback);
    return {
      stop: function () {
        listenHandle.stop();
      }
    };
  },
  // Register a callback to be invoked any time we skip oplog entries (eg,
  // because we are too far behind).
  onSkippedEntries: function (callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onSkippedEntries on stopped handle!");
    return self._onSkippedEntriesHook.register(callback);
  },
  // Calls `callback` once the oplog has been processed up to a point that is
  // roughly "now": specifically, once we've processed all ops that are
  // currently visible.
  // XXX become convinced that this is actually safe even if oplogConnection
  // is some kind of pool
  waitUntilCaughtUp: function () {
    var self = this;
    if (self._stopped)
      throw new Error("Called waitUntilCaughtUp on stopped handle!");

    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to
    // be ready.
    self._readyFuture.wait();

    while (!self._stopped) {
      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we might
      // find a TS that won't show up in the actual tail stream.
      try {
        var lastEntry = self._oplogLastEntryConnection.findOne(
          OPLOG_COLLECTION, self._baseOplogSelector,
          {fields: {ts: 1}, sort: {$natural: -1}});
        break;
      } catch (e) {
        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while reading last entry: " + e);
        Meteor._sleepForMs(100);
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
    var insertAfter = self._catchingUpFutures.length;
    while (insertAfter - 1 > 0
           && self._catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {
      insertAfter--;
    }
    var f = new Future;
    self._catchingUpFutures.splice(insertAfter, 0, {ts: ts, future: f});
    f.wait();
  },
  _startTailing: function () {
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
      self._oplogUrl, {poolSize: 1});
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    self._oplogLastEntryConnection = new MongoConnection(
      self._oplogUrl, {poolSize: 1});

    // Now, make sure that there actually is a repl set here. If not, oplog
    // tailing won't ever find anything!
    var f = new Future;
    self._oplogLastEntryConnection.db.admin().command(
      { ismaster: 1 }, f.resolver());
    var isMasterDoc = f.wait();
    if (!(isMasterDoc && isMasterDoc.documents && isMasterDoc.documents[0] &&
          isMasterDoc.documents[0].setName)) {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " +
                  "a Mongo replica set");
    }

    // Find the last oplog entry.
    var lastOplogEntry = self._oplogLastEntryConnection.findOne(
      OPLOG_COLLECTION, {}, {sort: {$natural: -1}, fields: {ts: 1}});

    var oplogSelector = _.clone(self._baseOplogSelector);
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

    self._tailHandle = self._oplogTailConnection.tail(
      cursorDescription, function (doc) {
        self._entryQueue.push(doc);
        self._maybeStartWorker();
      }
    );
    self._readyFuture.return();
  },

  _maybeStartWorker: function () {
    var self = this;
    if (self._workerActive)
      return;
    self._workerActive = true;
    Meteor.defer(function () {
      try {
        while (! self._stopped && ! self._entryQueue.isEmpty()) {
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

          var doc = self._entryQueue.shift();

          if (!(doc.ns && doc.ns.length > self._dbName.length + 1 &&
                doc.ns.substr(0, self._dbName.length + 1) ===
                (self._dbName + '.'))) {
            throw new Error("Unexpected ns");
          }

          var trigger = {collection: doc.ns.substr(self._dbName.length + 1),
                         dropCollection: false,
                         op: doc};

          // Is it a special command and the collection name is hidden somewhere
          // in operator?
          if (trigger.collection === "$cmd") {
            trigger.collection = doc.o.drop;
            trigger.dropCollection = true;
            trigger.id = null;
          } else {
            // All other ops have an id.
            trigger.id = idForOp(doc);
          }

          self._crossbar.fire(trigger);

          // Now that we've processed this operation, process pending
          // sequencers.
          if (!doc.ts)
            throw Error("oplog entry without ts: " + EJSON.stringify(doc));
          self._setLastProcessedTS(doc.ts);
        }
      } finally {
        self._workerActive = false;
      }
    });
  },
  _setLastProcessedTS: function (ts) {
    var self = this;
    self._lastProcessedTS = ts;
    while (!_.isEmpty(self._catchingUpFutures)
           && self._catchingUpFutures[0].ts.lessThanOrEqual(
             self._lastProcessedTS)) {
      var sequencer = self._catchingUpFutures.shift();
      sequencer.future.return();
    }
  }
});
