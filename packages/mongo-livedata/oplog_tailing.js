var Future = Npm.require('fibers/future');

var OPLOG_COLLECTION = 'oplog.rs';

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
// XXX this is duplicated with accounts_server.js
var quotemeta = function (str) {
    return String(str).replace(/(\W)/g, '\\$1');
};

var showTS = function (ts) {
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";
};

MongoConnection.prototype._startOplogTailing = function (oplogUrl,
                                                         dbNameFuture) {
  var self = this;

  var oplogLastEntryConnection = null;
  var oplogTailConnection = null;
  var stopped = false;
  var tailHandle = null;
  var readyFuture = new Future();
  var crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata", factName: "oplog-watchers"
  });
  var lastProcessedTS = null;
  // Lazily calculate the basic selector. Don't call baseOplogSelector() at the
  // top level of this function, because we don't want this function to block.
  var baseOplogSelector = _.once(function () {
    return {
      ns: new RegExp('^' + quotemeta(dbNameFuture.wait()) + '\\.'),
      $or: [
        { op: {$in: ['i', 'u', 'd']} },
        // If it is not db.collection.drop(), ignore it
        { op: 'c', 'o.drop': { $exists: true } }]
    };
  });
  // XXX doc
  var catchingUpFutures = [];

  self._oplogHandle = {
    stop: function () {
      if (stopped)
        return;
      stopped = true;
      if (tailHandle)
        tailHandle.stop();
      // XXX should close connections too
    },

    onOplogEntry: function (trigger, callback) {
      if (stopped)
        throw new Error("Called onOplogEntry on stopped handle!");

      // Calling onOplogEntry requires us to wait for the tailing to be ready.
      readyFuture.wait();

      var originalCallback = callback;
      callback = Meteor.bindEnvironment(function (notification, onComplete) {
        // XXX can we avoid this clone by making oplog.js careful?
        try {
          originalCallback(EJSON.clone(notification));
        } finally {
          onComplete();
        }
      }, function (err) {
        Meteor._debug("Error in oplog callback", err.stack);
      });
      var listenHandle = crossbar.listen(trigger, callback);
      return {
        stop: function () {
          listenHandle.stop();
        }
      };
    },

    // Calls `callback` once the oplog has been processed up to a point that is
    // roughly "now": specifically, once we've processed all ops that are
    // currently visible.
    // XXX become convinced that this is actually safe even if oplogConnection
    // is some kind of pool
    waitUntilCaughtUp: function () {
      if (stopped)
        throw new Error("Called waitUntilCaughtUp on stopped handle!");

      // Calling waitUntilCaughtUp requries us to wait for the oplog connection
      // to be ready.
      readyFuture.wait();

      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we
      // might find a TS that won't show up in the actual tail stream.
      var lastEntry = oplogLastEntryConnection.findOne(
        OPLOG_COLLECTION, baseOplogSelector(),
        {fields: {ts: 1}, sort: {$natural: -1}});

      if (!lastEntry) {
        // Really, nothing in the oplog? Well, we've processed everything.
        return;
      }

      var ts = lastEntry.ts;
      if (!ts)
        throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));

      if (lastProcessedTS && ts.lessThanOrEqual(lastProcessedTS)) {
        // We've already caught up to here.
        return;
      }

      var insertAfter = catchingUpFutures.length;
      while (insertAfter - 1 > 0
             && catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {
        insertAfter--;
      }

      // XXX this can occur if we fail over from one primary to another.  so
      // this check needs to be removed before we merge oplog.  that said, it
      // has been helpful so far at proving that we are properly using
      // poolSize 1. Also, we could keep something like it if we could
      // actually detect failover; see
      // https://github.com/mongodb/node-mongodb-native/issues/1120
      if (insertAfter !== catchingUpFutures.length) {
        throw Error("found misordered oplog: "
                    + showTS(_.last(catchingUpFutures).ts) + " vs "
                    + showTS(ts));
      }
      var f = new Future;
      catchingUpFutures.splice(insertAfter, 0, {ts: ts, future: f});
      f.wait();
    }
  };

  // Setting up the connections and tail handler is a blocking operation, so we
  // do it "later".
  Meteor.defer(function () {
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
    oplogTailConnection = new MongoConnection(oplogUrl, {poolSize: 1});
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    oplogLastEntryConnection = new MongoConnection(oplogUrl, {poolSize: 1});

    // Find the last oplog entry. Blocks until the connection is ready.
    var lastOplogEntry = oplogLastEntryConnection.findOne(
      OPLOG_COLLECTION, {}, {sort: {$natural: -1}});

    var dbName = dbNameFuture.wait();

    var oplogSelector = _.clone(baseOplogSelector());
    if (lastOplogEntry) {
      // Start after the last entry that currently exists.
      oplogSelector.ts = {$gt: lastOplogEntry.ts};
      // If there are any calls to callWhenProcessedLatest before any other
      // oplog entries show up, allow callWhenProcessedLatest to call its
      // callback immediately.
      lastProcessedTS = lastOplogEntry.ts;
    }

    var cursorDescription = new CursorDescription(
      OPLOG_COLLECTION, oplogSelector, {tailable: true});

    tailHandle = oplogTailConnection.tail(cursorDescription, function (doc) {
      if (!(doc.ns && doc.ns.length > dbName.length + 1 &&
            doc.ns.substr(0, dbName.length + 1) === (dbName + '.')))
        throw new Error("Unexpected ns");

      var trigger = {collection: doc.ns.substr(dbName.length + 1),
                     dropCollection: false,
                     op: doc};

      // Is it a special command and the collection name is hidden somewhere in
      // operator?
      if (trigger.collection === "$cmd") {
        trigger.collection = doc.o.drop;
        trigger.dropCollection = true;
        trigger.id = null;
      } else {
        // All other ops have an id.
        trigger.id = idForOp(doc);
      }

      var f = new Future;
      crossbar.fire(trigger, f.resolver());
      f.wait();

      // Now that we've processed this operation, process pending sequencers.
      if (!doc.ts)
        throw Error("oplog entry without ts: " + EJSON.stringify(doc));
      lastProcessedTS = doc.ts;
      while (!_.isEmpty(catchingUpFutures)
             && catchingUpFutures[0].ts.lessThanOrEqual(lastProcessedTS)) {
        var sequencer = catchingUpFutures.shift();
        sequencer.future.return();
      }
    });
    readyFuture.return();
  });
};
