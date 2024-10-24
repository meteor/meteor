import has from 'lodash.has'; 
import isEmpty from 'lodash.isempty';

let nextObserveHandleId = 1;

ObserveMultiplexer = class {
  constructor({ ordered, onStop = () => {} } = {}) {
    if (ordered === undefined) throw Error("must specify ordered");

    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "mongo-livedata", "observe-multiplexers", 1);

    this._ordered = ordered;
    this._onStop = onStop;
    this._queue = new Meteor._AsynchronousQueue();
    this._handles = {};
    this._resolver = null;
    this._readyPromise = new Promise(r => this._resolver = r).then(() => this._isReady = true);
    this._cache = new LocalCollection._CachingChangeObserver({
      ordered});
    // Number of addHandleAndSendInitialAdds tasks scheduled but not yet
    // running. removeHandle uses this to know if it's time to call the onStop
    // callback.
    this._addHandleTasksScheduledButNotPerformed = 0;

    const self = this;
    this.callbackNames().forEach(callbackName => {
      this[callbackName] = function(/* ... */) {
        self._applyCallback(callbackName, [...arguments]);
      };
    });
  }

  addHandleAndSendInitialAdds(handle) {
    return this._addHandleAndSendInitialAdds(handle);
  }

  async _addHandleAndSendInitialAdds(handle) {
    ++this._addHandleTasksScheduledButNotPerformed;

    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "mongo-livedata", "observe-handles", 1);

    const self = this;
    await this._queue.runTask(async function () {
      self._handles[handle._id] = handle;
      // Send out whatever adds we have so far (whether the
      // multiplexer is ready).
      await self._sendAdds(handle);
      --self._addHandleTasksScheduledButNotPerformed;
    });
    await this._readyPromise;
  }

  // Remove an observe handle. If it was the last observe handle, call the
  // onStop callback; you cannot add any more observe handles after this.
  //
  // This is not synchronized with polls and handle additions: this means that
  // you can safely call it from within an observe callback, but it also means
  // that we have to be careful when we iterate over _handles.
  async removeHandle(id) {
    // This should not be possible: you can only call removeHandle by having
    // access to the ObserveHandle, which isn't returned to user code until the
    // multiplex is ready.
    if (!this._ready())
      throw new Error("Can't remove handles until the multiplex is ready");

    delete this._handles[id];

    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "mongo-livedata", "observe-handles", -1);

    if (isEmpty(this._handles) &&
        this._addHandleTasksScheduledButNotPerformed === 0) {
      await this._stop();
    }
  }
  async _stop(options) {
    options = options || {};

    // It shouldn't be possible for us to stop when all our handles still
    // haven't been returned from observeChanges!
    if (! this._ready() && ! options.fromQueryError)
      throw Error("surprising _stop: not ready");

    // Call stop callback (which kills the underlying process which sends us
    // callbacks and removes us from the connection's dictionary).
    await this._onStop();
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "mongo-livedata", "observe-multiplexers", -1);

    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop
    // callback should make our connection forget about us).
    this._handles = null;
  }

  // Allows all addHandleAndSendInitialAdds calls to return, once all preceding
  // adds have been processed. Does not block.
  async ready() {
    const self = this;
    this._queue.queueTask(function () {
      if (self._ready())
        throw Error("can't make ObserveMultiplex ready twice!");

      if (!self._resolver) {
        throw new Error("Missing resolver");
      }

      self._resolver();
      self._isReady = true;
    });
  }

  // If trying to execute the query results in an error, call this. This is
  // intended for permanent errors, not transient network errors that could be
  // fixed. It should only be called before ready(), because if you called ready
  // that meant that you managed to run the query once. It will stop this
  // ObserveMultiplex and cause addHandleAndSendInitialAdds calls (and thus
  // observeChanges calls) to throw the error.
  async queryError(err) {
    var self = this;
    await this._queue.runTask(function () {
      if (self._ready())
        throw Error("can't claim query has an error after it worked!");
      self._stop({fromQueryError: true});
      throw err;
    });
  }

  // Calls "cb" once the effects of all "ready", "addHandleAndSendInitialAdds"
  // and observe callbacks which came before this call have been propagated to
  // all handles. "ready" must have already been called on this multiplexer.
  async onFlush(cb) {
    var self = this;
    await this._queue.queueTask(async function () {
      if (!self._ready())
        throw Error("only call onFlush on a multiplexer that will be ready");
      await cb();
    });
  }
  callbackNames() {
    if (this._ordered)
      return ["addedBefore", "changed", "movedBefore", "removed"];
    else
      return ["added", "changed", "removed"];
  }
  _ready() {
    return !!this._isReady;
  }
  _applyCallback(callbackName, args) {
    const self = this;
    this._queue.queueTask(async function () {
      // If we stopped in the meantime, do nothing.
      if (!self._handles)
        return;

      // First, apply the change to the cache.
      await self._cache.applyChange[callbackName].apply(null, args);
      // If we haven't finished the initial adds, then we should only be getting
      // adds.
      if (!self._ready() &&
          (callbackName !== 'added' && callbackName !== 'addedBefore')) {
        throw new Error("Got " + callbackName + " during initial adds");
      }

      // Now multiplex the callbacks out to all observe handles. It's OK if
      // these calls yield; since we're inside a task, no other use of our queue
      // can continue until these are done. (But we do have to be careful to not
      // use a handle that got removed, because removeHandle does not use the
      // queue; thus, we iterate over an array of keys that we control.)
      for (const handleId of Object.keys(self._handles)) {
        var handle = self._handles && self._handles[handleId];
        if (!handle) return;
        var callback = handle['_' + callbackName];
        // clone arguments so that callbacks can mutate their arguments

        callback &&
          (await callback.apply(
            null,
            handle.nonMutatingCallbacks ? args : EJSON.clone(args)
          ));
      }
    });
  }

  // Sends initial adds to a handle. It should only be called from within a task
  // (the task that is processing the addHandleAndSendInitialAdds call). It
  // synchronously invokes the handle's added or addedBefore; there's no need to
  // flush the queue afterwards to ensure that the callbacks get out.
  async _sendAdds(handle) {
    var add = this._ordered ? handle._addedBefore : handle._added;
    if (!add)
      return;
    // note: docs may be an _IdMap or an OrderedDict
    await this._cache.docs.forEachAsync(async (doc, id) => {
      if (!has(this._handles, handle._id))
        throw Error("handle got removed before sending initial adds!");
      const { _id, ...fields } = handle.nonMutatingCallbacks ? doc
          : EJSON.clone(doc);
      if (this._ordered)
        await add(id, fields, null); // we're going in order, so add at end
      else
        await add(id, fields);
    });
  }
};

// When the callbacks do not mutate the arguments, we can skip a lot of data clones
ObserveHandle = class {
  constructor(multiplexer, callbacks, nonMutatingCallbacks = false) {
    this._multiplexer = multiplexer;
    multiplexer.callbackNames().forEach((name) => {
      if (callbacks[name]) {
        this['_' + name] = callbacks[name];
      } else if (name === "addedBefore" && callbacks.added) {
        // Special case: if you specify "added" and "movedBefore", you get an
        // ordered observe where for some reason you don't get ordering data on
        // the adds.  I dunno, we wrote tests for it, there must have been a
        // reason.
        this._addedBefore = async function (id, fields, before) {
          await callbacks.added(id, fields);
        };
      }
    });
    this._stopped = false;
    this._id = nextObserveHandleId++;
    this.nonMutatingCallbacks = nonMutatingCallbacks;
  }

  async stop() {
    if (this._stopped) return;
    this._stopped = true;
    await this._multiplexer.removeHandle(this._id);
  }
};