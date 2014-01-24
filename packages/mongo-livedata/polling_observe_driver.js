PollingObserveDriver = function (options) {
  var self = this;

  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._ordered = options.ordered;
  self._multiplexer = options.multiplexer;
  self._stopCallbacks = [];
  self._stopped = false;

  self._synchronousCursor = self._mongoHandle._createSynchronousCursor(
    self._cursorDescription);

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self._results = null;

  // The number of _pollMongo calls that have been added to self._taskQueue but
  // have not started running. Used to make sure we never schedule more than one
  // _pollMongo (other than possibly the one that is currently running). It's
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,
  // it's either 0 (for "no polls scheduled other than maybe one currently
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can
  // also be 2 if incremented by _suspendPolling.
  self._pollsScheduledButNotStarted = 0;
  self._pendingWrites = []; // people to notify when polling completes

  // Make sure to create a separately throttled function for each
  // PollingObserveDriver object.
  self._ensurePollIsScheduled = _.throttle(
    self._unthrottledEnsurePollIsScheduled, 50 /* ms */);

  // XXX figure out if we still need a queue
  self._taskQueue = new Meteor._SynchronousQueue();

  var listenersHandle = listenAll(
    self._cursorDescription, function (notification) {
      // When someone does a transaction that might affect us, schedule a poll
      // of the database. If that transaction happens inside of a write fence,
      // block the fence until we've polled and notified observers.
      var fence = DDPServer._CurrentWriteFence.get();
      if (fence)
        self._pendingWrites.push(fence.beginWrite());
      // Ensure a poll is scheduled... but if we already know that one is,
      // don't hit the throttled _ensurePollIsScheduled function (which might
      // lead to us calling it unnecessarily in 50ms).
      if (self._pollsScheduledButNotStarted === 0)
        self._ensurePollIsScheduled();
    }
  );
  self._stopCallbacks.push(function () { listenersHandle.stop(); });

  // every once and a while, poll even if we don't think we're dirty, for
  // eventual consistency with database writes from outside the Meteor
  // universe.
  //
  // For testing, there's an undocumented callback argument to observeChanges
  // which disables time-based polling and gets called at the beginning of each
  // poll.
  if (options._testOnlyPollCallback) {
    self._testOnlyPollCallback = options._testOnlyPollCallback;
  } else {
    var intervalHandle = Meteor.setInterval(
      _.bind(self._ensurePollIsScheduled, self), 10 * 1000);
    self._stopCallbacks.push(function () {
      Meteor.clearInterval(intervalHandle);
    });
  }

  // Make sure we actually poll soon!
  self._unthrottledEnsurePollIsScheduled();

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "observe-drivers-polling", 1);
};

_.extend(PollingObserveDriver.prototype, {
  // This is always called through _.throttle (except once at startup).
  _unthrottledEnsurePollIsScheduled: function () {
    var self = this;
    if (self._pollsScheduledButNotStarted > 0)
      return;
    ++self._pollsScheduledButNotStarted;
    self._taskQueue.queueTask(function () {
      self._pollMongo();
    });
  },

  // test-only interface for controlling polling.
  //
  // _suspendPolling blocks until any currently running and scheduled polls are
  // done, and prevents any further polls from being scheduled. (new
  // ObserveHandles can be added and receive their initial added callbacks,
  // though.)
  //
  // _resumePolling immediately polls, and allows further polls to occur.
  _suspendPolling: function() {
    var self = this;
    // Pretend that there's another poll scheduled (which will prevent
    // _ensurePollIsScheduled from queueing any more polls).
    ++self._pollsScheduledButNotStarted;
    // Now block until all currently running or scheduled polls are done.
    self._taskQueue.runTask(function() {});

    // Confirm that there is only one "poll" (the fake one we're pretending to
    // have) scheduled.
    if (self._pollsScheduledButNotStarted !== 1)
      throw new Error("_pollsScheduledButNotStarted is " +
                      self._pollsScheduledButNotStarted);
  },
  _resumePolling: function() {
    var self = this;
    // We should be in the same state as in the end of _suspendPolling.
    if (self._pollsScheduledButNotStarted !== 1)
      throw new Error("_pollsScheduledButNotStarted is " +
                      self._pollsScheduledButNotStarted);
    // Run a poll synchronously (which will counteract the
    // ++_pollsScheduledButNotStarted from _suspendPolling).
    self._taskQueue.runTask(function () {
      self._pollMongo();
    });
  },

  _pollMongo: function () {
    var self = this;
    --self._pollsScheduledButNotStarted;

    var first = false;
    if (!self._results) {
      first = true;
      // XXX maybe use OrderedDict instead?
      self._results = self._ordered ? [] : new LocalCollection._IdMap;
    }

    self._testOnlyPollCallback && self._testOnlyPollCallback();

    // Save the list of pending writes which this round will commit.
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];

    // Get the new query results. (These calls can yield.)
    if (!first)
      self._synchronousCursor.rewind();
    var newResults = self._synchronousCursor.getRawObjects(self._ordered);
    var oldResults = self._results;

    // Run diffs. (This can yield too.)
    if (!self._stopped) {
      LocalCollection._diffQueryChanges(
        self._ordered, oldResults, newResults, self._multiplexer);
    }

    // Replace self._results atomically.
    self._results = newResults;

    // Signals the multiplexer to call all initial adds.
    if (first)
      self._multiplexer.ready();

    // Once the ObserveMultiplexer has processed everything we've done in this
    // round, mark all the writes which existed before this call as
    // commmitted. (If new writes have shown up in the meantime, there'll
    // already be another _pollMongo task scheduled.)
    self._multiplexer.onFlush(function () {
      _.each(writesForCycle, function (w) {
        w.committed();
      });
    });
  },

  stop: function () {
    var self = this;
    self._stopped = true;
    _.each(self._stopCallbacks, function (c) { c(); });
    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-drivers-polling", -1);
  }
});
