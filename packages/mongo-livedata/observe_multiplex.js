var Future = Npm.require('fibers/future');

ObserveMultiplexer = function (options) {
  var self = this;

  if (!options || !_.has(options, 'ordered'))
    throw Error("must specified ordered");

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "observe-multiplexers", 1);

  self._ordered = options.ordered;
  self._onStop = options.onStop || function () {};
  self._queue = new Meteor._SynchronousQueue();
  self._handles = {};
  self._ready = false;
  self._readyFuture = new Future;
  self._cache = new LocalCollection._CachingChangeObserver({
    ordered: options.ordered});
  // Number of addHandleAndSendInitialAdds tasks scheduled but not yet
  // running. removeHandle uses this to know if it's time to call the onStop
  // callback.
  self._addHandleTasksScheduledButNotPerformed = 0;

  _.each(self.callbackNames(), function (callbackName) {
    self[callbackName] = function (/* ... */) {
      self._applyCallback(callbackName, _.toArray(arguments));
    };
  });
};

_.extend(ObserveMultiplexer.prototype, {
  addHandleAndSendInitialAdds: function (handle) {
    var self = this;

    // Check this before calling runTask (even though runTask does the same
    // check) so that we don't leak an ObserveMultiplexer on error by
    // incrementing _addHandleTasksScheduledButNotPerformed and never
    // decrementing it.
    if (!self._queue.safeToRunTask())
      throw new Error(
        "Can't call observeChanges from an observe callback on the same query");
    ++self._addHandleTasksScheduledButNotPerformed;

    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", 1);

    self._queue.runTask(function () {
      self._handles[handle._id] = handle;
      if (self._ready)
        self._sendAdds(handle);
      --self._addHandleTasksScheduledButNotPerformed;
    });
    // *outside* the task, since otherwise we'd deadlock
    self._waitUntilReady();
  },

  // Remove an observe handle. If it was the last observe handle, call the
  // onStop callback; you cannot add any more observe handles after this.
  //
  // This is not synchronized with polls and handle additions: this means that
  // you can safely call it from within an observe callback, but it also means
  // that we have to be careful when we iterate over _handles.
  removeHandle: function (id) {
    var self = this;
    delete self._handles[id];

    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", -1);

    if (_.isEmpty(self._handles) &&
        self._addHandleTasksScheduledButNotPerformed === 0) {
      self._stop();
    }
  },
  _stop: function () {
    var self = this;
    // Call stop callback (which kills the underlying process which sends us
    // callbacks and removes us from the connection's dictionary).
    self._onStop();
    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop
    // callback should make our connection forget about us).
    self._handles = null;
    // It shouldn't be possible for us to stop when all our handles still
    // haven't been returned from observeChanges!
    if (!self._readyFuture.isResolved())
      throw Error("surprising _stop");

    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-multiplexers", -1);
  },
  _waitUntilReady: function (handle) {
    var self = this;
    self._readyFuture.wait();
  },
  // Sends initial adds to all the handles we know about so far. Does not block.
  ready: function () {
    var self = this;
    self._queue.queueTask(function () {
      if (self._ready)
        throw Error("can't make ObserveMultiplex ready twice!");
      self._ready = true;
      // Use _.keys iteration in case removeHandle is called concurrently.
      _.each(_.keys(self._handles), function (handleId) {
        var handle = self._handles[handleId];
        handle && self._sendAdds(handle);
      });
      self._readyFuture.return();
    });
  },
  onFlush: function (cb) {
    var self = this;
    self._queue.queueTask(cb);
  },
  callbackNames: function () {
    var self = this;
    if (self._ordered)
      return ["addedBefore", "changed", "movedBefore", "removed"];
    else
      return ["added", "changed", "removed"];
  },
  _applyCallback: function (callbackName, args) {
    var self = this;
    self._queue.queueTask(function () {
      // First, apply the change to the cache.
      // XXX We could make applyChange callbacks promise not to hang on to any
      // state from their arguments (assuming that their supplied callbacks
      // don't) and skip this clone. Currently 'changed' hangs on to state
      // though.
      self._cache.applyChange[callbackName].apply(null, EJSON.clone(args));
      // If we haven't finished the initial adds, we have nothing more to do.
      if (!self._ready)
        return;
      // Now multiplex the callbacks out to all observe handles. It's OK if
      // these calls yield; since we're inside a task, no other use of our queue
      // can continue until these are done. (But we do have to be careful to not
      // use a handle that got removed, because removeHandle does not use the
      // queue.)
      _.each(_.keys(self._handles), function (handleId) {
        var handle = self._handles[handleId];
        if (!handle)
          return;
        var callback = handle['_' + callbackName];
        // clone arguments so that callbacks can mutate their arguments
        callback && callback.apply(null, EJSON.clone(args));
      });
    });
  },

  // Sends initial adds to a handle. It should only be called once the handle is
  // ready (ie, the ready callback has been called) and from within a task
  // (either the task that is processing the ready() call or the task that is
  // processing the addHandleAndSendInitialAdds call). It synchronously invokes
  // the handle's added or addedBefore; there's no need to flush the queue
  // afterwards to ensure that the callbacks get out.
  _sendAdds: function (handle) {
    var self = this;
    if (self._queue.safeToRunTask())
      throw Error("_sendAdds may only be called from within a task!");
    if (!self._ready)
      throw Error("_sendAdds may only be called once ready!");
    var add = self._ordered ? handle._addedBefore : handle._added;
    if (!add)
      return;
    // note: docs may be an _IdMap or an OrderedDict
    self._cache.docs.forEach(function (doc, id) {
      if (!_.has(self._handles, handle._id))
        throw Error("handle got removed before sending initial adds!");
      var fields = EJSON.clone(doc);
      delete fields._id;
      if (self._ordered)
        add(id, fields, null); // we're going in order, so add at end
      else
        add(id, fields);
    });
  }
});


var nextObserveHandleId = 1;
ObserveHandle = function (multiplexer, callbacks) {
  var self = this;
  // The end user is only supposed to call stop().  The other fields are
  // accessible to the multiplexer, though.
  self._multiplexer = multiplexer;
  _.each(multiplexer.callbackNames(), function (name) {
    if (callbacks[name]) {
      self['_' + name] = callbacks[name];
    } else if (name === "addedBefore" && callbacks.added) {
      // Special case: if you specify "added" and "movedBefore", you get an
      // ordered observe where for some reason you don't get ordering data on
      // the adds.  I dunno, we wrote tests for it, there must have been a
      // reason.
      self._addedBefore = function (id, fields, before) {
        callbacks.added(id, fields);
      };
    }
  });
  self._stopped = false;
  self._id = nextObserveHandleId++;
};
ObserveHandle.prototype.stop = function () {
  var self = this;
  if (self._stopped)
    return;
  self._stopped = true;
  self._multiplexer.removeHandle(self._id);
};
