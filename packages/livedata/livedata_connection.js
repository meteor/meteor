(function () {
if (Meteor.isServer) {
  // XXX namespacing
  var Future = __meteor_bootstrap__.require(path.join('fibers', 'future'));
}

// @param url {String|Object} URL to Meteor app,
//   or an object as a test hook (see code)
// Options:
//   reloadOnUpdate: should we try to reload when the server says
//                      there's new code available?
//   reloadWithOutstanding: is it OK to reload if there are outstanding methods?
Meteor._LivedataConnection = function (url, options) {
  var self = this;
  options = _.extend({
    reloadOnUpdate: false,
    // The rest of these options are only for testing.
    reloadWithOutstanding: false,
    supportedDDPVersions: Meteor._SUPPORTED_DDP_VERSIONS,
    onConnectionFailure: function (reason) {
      Meteor._debug("Failed DDP connection: " + reason);
    },
    onConnected: function () {}
  }, options);

  // If set, called when we reconnect, queuing method calls _before_ the
  // existing outstanding ones. This is the only data member that is part of the
  // public API!
  self.onReconnect = null;

  // as a test hook, allow passing a stream instead of a url.
  if (typeof url === "object") {
    self._stream = url;
  } else {
    self._stream = new Meteor._Stream(url);
  }

  self._lastSessionId = null;
  self._versionSuggestion = null;  // The last proposed DDP version.
  self._version = null;   // The DDP version agreed on by client and server.
  self._stores = {}; // name -> object with methods
  self._methodHandlers = {}; // name -> func
  self._nextMethodId = 1;
  self._supportedDDPVersions = options.supportedDDPVersions;

  // Tracks methods which the user has tried to call but which have not yet
  // called their user callback (ie, they are waiting on their result or for all
  // of their writes to be written to the local cache). Map from method ID to
  // MethodInvoker object.
  self._methodInvokers = {};

  // Tracks methods which the user has called but whose result messages have not
  // arrived yet.
  //
  // _outstandingMethodBlocks is an array of blocks of methods. Each block
  // represents a set of methods that can run at the same time. The first block
  // represents the methods which are currently in flight; subsequent blocks
  // must wait for previous blocks to be fully finished before they can be sent
  // to the server.
  //
  // Each block is an object with the following fields:
  // - methods: a list of MethodInvoker objects
  // - wait: a boolean; if true, this block had a single method invoked with
  //         the "wait" option
  //
  // There will never be adjacent blocks with wait=false, because the only thing
  // that makes methods need to be serialized is a wait method.
  //
  // Methods are removed from the first block when their "result" is
  // received. The entire first block is only removed when all of the in-flight
  // methods have received their results (so the "methods" list is empty) *AND*
  // all of the data written by those methods are visible in the local cache. So
  // it is possible for the first block's methods list to be empty, if we are
  // still waiting for some objects to quiesce.
  //
  // Example:
  //  _outstandingMethodBlocks = [
  //    {wait: false, methods: []},
  //    {wait: true, methods: [<MethodInvoker for 'login'>]},
  //    {wait: false, methods: [<MethodInvoker for 'foo'>,
  //                            <MethodInvoker for 'bar'>]}]
  // This means that there were some methods which were sent to the server and
  // which have returned their results, but some of the data written by
  // the methods may not be visible in the local cache. Once all that data is
  // visible, we will send a 'login' method. Once the login method has returned
  // and all the data is visible (including re-running subs if userId changes),
  // we will send the 'foo' and 'bar' methods in parallel.
  self._outstandingMethodBlocks = [];

  // method ID -> array of objects with keys 'collection' and 'id', listing
  // documents written by a given method's stub. keys are associated with
  // methods whose stub wrote at least one document, and whose data-done message
  // has not yet been received.
  self._documentsWrittenByStub = {};
  // collection -> id -> "server document" object. A "server document" has:
  // - "document": the version of the document according the
  //   server (ie, the snapshot before a stub wrote it, amended by any changes
  //   received from the server)
  //   It is undefined if we think the document does not exist
  // - "writtenByStubs": a set of method IDs whose stubs wrote to the document
  //   whose "data done" messages have not yet been processed
  self._serverDocuments = {};

  // Array of callbacks to be called after the next update of the local
  // cache. Used for:
  //  - Calling methodInvoker.dataVisible and sub ready callbacks after
  //    the relevant data is flushed.
  //  - Invoking the callbacks of "half-finished" methods after reconnect
  //    quiescence. Specifically, methods whose result was received over the old
  //    connection (so we don't re-send it) but whose data had not been made
  //    visible.
  self._afterUpdateCallbacks = [];

  // In two contexts, we buffer all incoming data messages and then process them
  // all at once in a single update:
  //   - During reconnect, we buffer all data messages until all subs that had
  //     been ready before reconnect are ready again, and all methods that are
  //     active have returned their "data done message"; then
  //   - During the execution of a "wait" method, we buffer all data messages
  //     until the wait method gets its "data done" message. (If the wait method
  //     occurs during reconnect, it doesn't get any special handling.)
  // all data messages are processed in one update.
  //
  // The following fields are used for this "quiescence" process.

  // This buffers the messages that aren't being processed yet.
  self._messagesBufferedUntilQuiescence = [];
  // Map from method ID -> true. Methods are removed from this when their
  // "data done" message is received, and we will not quiesce until it is
  // empty.
  self._methodsBlockingQuiescence = {};
  // map from sub ID -> true for subs that were ready (ie, called the sub
  // ready callback) before reconnect but haven't become ready again yet
  self._subsBeingRevived = {}; // map from sub._id -> true
  // if true, the next data update should reset all stores. (set during
  // reconnect.)
  self._resetStores = false;

  // name -> array of updates for (yet to be created) collections
  self._updatesForUnknownStores = {};
  // if we're blocking a migration, the retry func
  self._retryMigrate = null;

  // metadata for subscriptions.  Map from sub ID to object with keys:
  //   - id
  //   - name
  //   - params
  //   - inactive (if true, will be cleaned up if not reused in re-run)
  //   - ready (has the 'ready' message been received?)
  //   - readyCallback (an optional callback to call when ready)
  //   - errorCallback (an optional callback to call if the sub terminates with
  //                    an error)
  self._subscriptions = {};

  // Per-connection scratch area. This is only used internally, but we
  // should have real and documented API for this sort of thing someday.
  self._sessionData = {};

  // Reactive userId.
  self._userId = null;
  self._userIdDeps = (typeof Deps !== "undefined") && new Deps.Dependency;

  // Block auto-reload while we're waiting for method responses.
  if (!options.reloadWithOutstanding) {
    Meteor._reload.onMigrate(function (retry) {
      if (!self._readyToMigrate()) {
        if (self._retryMigrate)
          throw new Error("Two migrations in progress?");
        self._retryMigrate = retry;
        return false;
      } else {
        return [true];
      }
    });
  }

  self._stream.on('message', function (raw_msg) {
    try {
      var msg = Meteor._parseDDP(raw_msg);
    } catch (e) {
      Meteor._debug("Exception while parsing DDP", e);
      return;
    }

    if (msg === null || !msg.msg) {
      Meteor._debug("discarding invalid livedata message", msg);
      return;
    }

    if (msg.msg === 'connected') {
      self._version = self._versionSuggestion;
      options.onConnected();
      self._livedata_connected(msg);
    }
    else if (msg.msg == 'failed') {
      if (_.contains(self._supportedDDPVersions, msg.version)) {
        self._versionSuggestion = msg.version;
        self._stream.reconnect({_force: true});
      } else {
        var error =
              "Version negotiation failed; server requested version " + msg.version;
        self._stream.forceDisconnect(error);
        options.onConnectionFailure(error);
      }
    }
    else if (_.include(['added', 'changed', 'removed', 'ready', 'updated'], msg.msg))
      self._livedata_data(msg);
    else if (msg.msg === 'nosub')
      self._livedata_nosub(msg);
    else if (msg.msg === 'result')
      self._livedata_result(msg);
    else if (msg.msg === 'error')
      self._livedata_error(msg);
    else
      Meteor._debug("discarding unknown livedata message type", msg);
  });

  self._stream.on('reset', function () {
    // Send a connect message at the beginning of the stream.
    // NOTE: reset is called even on the first connection, so this is
    // the only place we send this message.
    var msg = {msg: 'connect'};
    if (self._lastSessionId)
      msg.session = self._lastSessionId;
    msg.version = self._versionSuggestion || self._supportedDDPVersions[0];
    self._versionSuggestion = msg.version;
    msg.support = self._supportedDDPVersions;
    self._send(msg);

    // Now, to minimize setup latency, go ahead and blast out all of
    // our pending methods ands subscriptions before we've even taken
    // the necessary RTT to know if we successfully reconnected. (1)
    // They're supposed to be idempotent; (2) even if we did
    // reconnect, we're not sure what messages might have gotten lost
    // (in either direction) since we were disconnected (TCP being
    // sloppy about that.)

    // If the current block of methods all got their results (but didn't all get
    // their data visible), discard the empty block now.
    if (! _.isEmpty(self._outstandingMethodBlocks) &&
        _.isEmpty(self._outstandingMethodBlocks[0].methods)) {
      self._outstandingMethodBlocks.shift();
    }

    // Mark all messages as unsent, they have not yet been sent on this
    // connection.
    _.each(self._methodInvokers, function (m) {
      m.sentMessage = false;
    });

    // If an `onReconnect` handler is set, call it first. Go through
    // some hoops to ensure that methods that are called from within
    // `onReconnect` get executed _before_ ones that were originally
    // outstanding (since `onReconnect` is used to re-establish auth
    // certificates)
    if (self.onReconnect)
      self._callOnReconnectAndSendAppropriateOutstandingMethods();
    else
      self._sendOutstandingMethods();

    // add new subscriptions at the end. this way they take effect after
    // the handlers and we don't see flicker.
    _.each(self._subscriptions, function (sub, id) {
      self._send({
        msg: 'sub',
        id: id,
        name: sub.name,
        params: sub.params
      });
    });
  });

  if (options.reloadOnUpdate) {
    self._stream.on('update_available', function () {
      // Start trying to migrate to a new version. Until all packages
      // signal that they're ready for a migration, the app will
      // continue running normally.
      Meteor._reload.reload();
    });
  }
};

// A MethodInvoker manages sending a method to the server and calling the user's
// callbacks. On construction, it registers itself in the connection's
// _methodInvokers map; it removes itself once the method is fully finished and
// the callback is invoked. This occurs when it has both received a result,
// and the data written by it is fully visible.
var MethodInvoker = function (options) {
  var self = this;

  // Public (within this file) fields.
  self.methodId = options.methodId;
  self.sentMessage = false;

  self._callback = options.callback;
  self._connection = options.connection;
  self._message = options.message;
  self._onResultReceived = options.onResultReceived || function () {};
  self._wait = options.wait;
  self._methodResult = null;
  self._dataVisible = false;

  // Register with the connection.
  self._connection._methodInvokers[self.methodId] = self;
};
_.extend(MethodInvoker.prototype, {
  // Sends the method message to the server. May be called additional times if
  // we lose the connection and reconnect before receiving a result.
  sendMessage: function () {
    var self = this;
    // This function is called before sending a method (including resending on
    // reconnect). We should only (re)send methods where we don't already have a
    // result!
    if (self.gotResult())
      throw new Error("sendingMethod is called on method with result");

    // If we're re-sending it, it doesn't matter if data was written the first
    // time.
    self._dataVisible = false;

    self.sentMessage = true;

    // If this is a wait method, make all data messages be buffered until it is
    // done.
    if (self._wait)
      self._connection._methodsBlockingQuiescence[self.methodId] = true;

    // Actually send the message.
    self._connection._send(self._message);
  },
  // Invoke the callback, if we have both a result and know that all data has
  // been written to the local cache.
  _maybeInvokeCallback: function () {
    var self = this;
    if (self._methodResult && self._dataVisible) {
      // Call the callback. (This won't throw: the callback was wrapped with
      // bindEnvironment.)
      self._callback(self._methodResult[0], self._methodResult[1]);

      // Forget about this method.
      delete self._connection._methodInvokers[self.methodId];

      // Let the connection know that this method is finished, so it can try to
      // move on to the next block of methods.
      self._connection._outstandingMethodFinished();
    }
  },
  // Call with the result of the method from the server. Only may be called
  // once; once it is called, you should not call sendMessage again.
  // If the user provided an onResultReceived callback, call it immediately.
  // Then invoke the main callback if data is also visible.
  receiveResult: function (err, result) {
    var self = this;
    if (self.gotResult())
      throw new Error("Methods should only receive results once");
    self._methodResult = [err, result];
    self._onResultReceived(err, result);
    self._maybeInvokeCallback();
  },
  // Call this when all data written by the method is visible. This means that
  // the method has returns its "data is done" message *AND* all server
  // documents that are buffered at that time have been written to the local
  // cache. Invokes the main callback if the result has been received.
  dataVisible: function () {
    var self = this;
    self._dataVisible = true;
    self._maybeInvokeCallback();
  },
  // True if receiveResult has been called.
  gotResult: function () {
    var self = this;
    return !!self._methodResult;
  }
});

_.extend(Meteor._LivedataConnection.prototype, {
  // 'name' is the name of the data on the wire that should go in the
  // store. 'wrappedStore' should be an object with methods beginUpdate, update,
  // endUpdate, saveOriginals, retrieveOriginals. see Collection for an example.
  registerStore: function (name, wrappedStore) {
    var self = this;

    if (name in self._stores)
      return false;

    // Wrap the input object in an object which makes any store method not
    // implemented by 'store' into a no-op.
    var store = {};
    _.each(['update', 'beginUpdate', 'endUpdate', 'saveOriginals',
            'retrieveOriginals'], function (method) {
              store[method] = function () {
                return (wrappedStore[method]
                        ? wrappedStore[method].apply(wrappedStore, arguments)
                        : undefined);
              };
            });

    self._stores[name] = store;

    var queued = self._updatesForUnknownStores[name];
    if (queued) {
      store.beginUpdate(queued.length, false);
      _.each(queued, function (msg) {
        store.update(msg);
      });
      store.endUpdate();
      delete self._updatesForUnknownStores[name];
    }

    return true;
  },

  subscribe: function (name /* .. [arguments] .. (callback|callbacks) */) {
    var self = this;

    var params = Array.prototype.slice.call(arguments, 1);
    var callbacks = {};
    if (params.length) {
      var lastParam = params[params.length - 1];
      if (typeof lastParam === "function") {
        callbacks.onReady = params.pop();
      } else if (lastParam && (typeof lastParam.onReady === "function" ||
                               typeof lastParam.onError === "function")) {
        callbacks = params.pop();
      }
    }

    // Is there an existing sub with the same name and param, run in an
    // invalidated Computation? This will happen if we are rerunning an
    // existing computation.
    //
    // For example, consider a rerun of:
    //
    //     Deps.autorun(function () {
    //       Meteor.subscribe("foo", Session.get("foo"));
    //       Meteor.subscribe("bar", Session.get("bar"));
    //     });
    //
    // If "foo" has changed but "bar" has not, we will match the "bar"
    // subcribe to an existing inactive subscription in order to not
    // unsub and resub the subscription unnecessarily.
    //
    // We only look for one such sub; if there are N apparently-identical subs
    // being invalidated, we will require N matching subscribe calls to keep
    // them all active.
    var existing = _.find(self._subscriptions, function (sub) {
      return sub.inactive && sub.name === name &&
        EJSON.equals(sub.params, params);
    });

    var id;
    if (existing) {
      id = existing.id;
      existing.inactive = false; // reactivate

      if (callbacks.onReady) {
        // If the sub is not already ready, replace any ready callback with the
        // one provided now. (It's not really clear what users would expect for
        // an onReady callback inside an autorun; the semantics we provide is
        // that at the time the sub first becomes ready, we call the last
        // onReady callback provided, if any.)
        if (!existing.ready)
          existing.readyCallback = callbacks.onReady;
      }
      if (callbacks.onError) {
        // Replace existing callback if any, so that errors aren't
        // double-reported.
        existing.errorCallback = callbacks.onError;
      }
    } else {
      // New sub! Generate an id, save it locally, and send message.
      id = Random.id();
      self._subscriptions[id] = {
        id: id,
        name: name,
        params: params,
        inactive: false,
        ready: false,
        readyDeps: (typeof Deps !== "undefined") && new Deps.Dependency,
        readyCallback: callbacks.onReady,
        errorCallback: callbacks.onError
      };
      self._send({msg: 'sub', id: id, name: name, params: params});
    }

    // return a handle to the application.
    var handle = {
      stop: function () {
        if (!_.has(self._subscriptions, id))
          return;
        self._send({msg: 'unsub', id: id});
        delete self._subscriptions[id];
      },
      ready: function () {
        // return false if we've unsubscribed.
        if (!_.has(self._subscriptions, id))
          return false;
        var record = self._subscriptions[id];
        record.readyDeps && Deps.depend(record.readyDeps);
        return record.ready;
      }
    };

    if (Deps.active) {
      // We're in a reactive computation, so we'd like to unsubscribe when the
      // computation is invalidated... but not if the rerun just re-subscribes
      // to the same subscription!  When a rerun happens, we use onInvalidate
      // as a change to mark the subscription "inactive" so that it can
      // be reused from the rerun.  If it isn't reused, it's killed from
      // an afterFlush.
      Deps.onInvalidate(function (c) {
        if (_.has(self._subscriptions, id))
          self._subscriptions[id].inactive = true;

        Deps.afterFlush(function () {
          if (_.has(self._subscriptions, id) &&
              self._subscriptions[id].inactive)
            handle.stop();
        });
      });
    }

    return handle;
  },

  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self._methodHandlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self._methodHandlers[name] = func;
    });
  },

  call: function (name /* .. [arguments] .. callback */) {
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();
    return this.apply(name, args, callback);
  },

  // @param options {Optional Object}
  //   wait: Boolean - Should we wait to call this until all current methods
  //                   are fully finished, and block subsequent method calls
  //                   until this method is fully finished?
  //                   (does not affect methods called from within this method)
  //   onResultReceived: Function - a callback to call as soon as the method
  //                                result is received. the data written by
  //                                the method may not yet be in the cache!
  // @param callback {Optional Function}
  apply: function (name, args, options, callback) {
    var self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    if (callback) {
      // XXX would it be better form to do the binding in stream.on,
      // or caller, instead of here?
      callback = Meteor.bindEnvironment(callback, function (e) {
        // XXX improve error message (and how we report it)
        Meteor._debug("Exception while delivering result of invoking '" +
                      name + "'", e, e.stack);
      });
    }

    // Lazily allocate method ID once we know that it'll be needed.
    var methodId = (function () {
      var id;
      return function () {
        if (id === undefined)
          id = '' + (self._nextMethodId++);
        return id;
      };
    })();

    if (Meteor.isClient) {
      // If on a client, run the stub, if we have one. The stub is
      // supposed to make some temporary writes to the database to
      // give the user a smooth experience until the actual result of
      // executing the method comes back from the server (whereupon
      // the temporary writes to the database will be reversed during
      // the beginUpdate/endUpdate process.)
      //
      // Normally, we ignore the return value of the stub (even if it
      // is an exception), in favor of the real return value from the
      // server. The exception is if the *caller* is a stub. In that
      // case, we're not going to do a RPC, so we use the return value
      // of the stub as our return value.
      var enclosing = Meteor._CurrentInvocation.get();
      var alreadyInSimulation = enclosing && enclosing.isSimulation;

      var stub = self._methodHandlers[name];
      if (stub) {
        var setUserId = function(userId) {
          self.setUserId(userId);
        };
        var invocation = new Meteor._MethodInvocation({
          isSimulation: true,
          userId: self.userId(), setUserId: setUserId,
          sessionData: self._sessionData
        });

        if (!alreadyInSimulation)
          self._saveOriginals();

        try {
          var ret = Meteor._CurrentInvocation.withValue(invocation,function () {
            return stub.apply(invocation, EJSON.clone(args));
          });
        }
        catch (e) {
          var exception = e;
        }

        if (!alreadyInSimulation)
          self._retrieveAndStoreOriginals(methodId());
      }

      // If we're in a simulation, stop and return the result we have,
      // rather than going on to do an RPC. If there was no stub,
      // we'll end up returning undefined.
      if (alreadyInSimulation) {
        if (callback) {
          callback(exception, ret);
          return undefined;
        }
        if (exception)
          throw exception;
        return ret;
      }

      // If an exception occurred in a stub, and we're ignoring it
      // because we're doing an RPC and want to use what the server
      // returns instead, log it so the developer knows.
      //
      // Tests can set the 'expected' flag on an exception so it won't
      // go to log.
      if (exception && !exception.expected) {
        Meteor._debug("Exception while simulating the effect of invoking '" +
                      name + "'", exception, exception.stack);
      }
    }

    // At this point we're definitely doing an RPC, and we're going to
    // return the value of the RPC to the caller.

    // If the caller didn't give a callback, decide what to do.
    if (!callback) {
      if (Meteor.isClient)
        // On the client, we don't have fibers, so we can't block. The
        // only thing we can do is to return undefined and discard the
        // result of the RPC.
        callback = function () {};
      else {
        // On the server, make the function synchronous.
        var future = new Future;
        callback = function (err, result) {
          future['return']([err, result]);
        };
      }
    }

    // Send the RPC. Note that on the client, it is important that the
    // stub have finished before we send the RPC, so that we know we have
    // a complete list of which local documents the stub wrote.
    var methodInvoker = new MethodInvoker({
      methodId: methodId(),
      callback: callback,
      connection: self,
      onResultReceived: options.onResultReceived,
      wait: !!options.wait,
      message: {
        msg: 'method',
        method: name,
        params: args,
        id: methodId()
      }
    });

    if (options.wait) {
      // It's a wait method! Wait methods go in their own block.
      self._outstandingMethodBlocks.push(
        {wait: true, methods: [methodInvoker]});
    } else {
      // Not a wait method. Start a new block if the previous block was a wait
      // block, and add it to the last block of methods.
      if (_.isEmpty(self._outstandingMethodBlocks) ||
          _.last(self._outstandingMethodBlocks).wait)
        self._outstandingMethodBlocks.push({wait: false, methods: []});
      _.last(self._outstandingMethodBlocks).methods.push(methodInvoker);
    }

    // If we added it to the first block, send it out now.
    if (self._outstandingMethodBlocks.length === 1)
      methodInvoker.sendMessage();

    // If we're using the default callback on the server,
    // synchronously return the result from the remote host.
    if (future) {
      var outcome = future.wait();
      if (outcome[0])
        throw outcome[0];
      return outcome[1];
    }
    return undefined;
  },

  // Before calling a method stub, prepare all stores to track changes and allow
  // _retrieveAndStoreOriginals to get the original versions of changed
  // documents.
  _saveOriginals: function () {
    var self = this;
    _.each(self._stores, function (s) {
      s.saveOriginals();
    });
  },
  // Retrieves the original versions of all documents modified by the stub for
  // method 'methodId' from all stores and saves them to _serverDocuments (keyed
  // by document) and _documentsWrittenByStub (keyed by method ID).
  _retrieveAndStoreOriginals: function (methodId) {
    var self = this;
    if (self._documentsWrittenByStub[methodId])
      throw new Error("Duplicate methodId in _retrieveAndStoreOriginals");

    var docsWritten = [];
    _.each(self._stores, function (s, collection) {
      var originals = s.retrieveOriginals();
      _.each(originals, function (doc, id) {
        if (typeof id !== 'string')
          throw new Error("id is not a string");
        docsWritten.push({collection: collection, id: id});
        var serverDoc = Meteor._ensure(self._serverDocuments, collection, id);
        if (serverDoc.writtenByStubs) {
          // We're not the first stub to write this doc. Just add our method ID
          // to the record.
          serverDoc.writtenByStubs[methodId] = true;
        } else {
          // First stub! Save the original value and our method ID.
          serverDoc.document = doc;
          serverDoc.flushCallbacks = [];
          serverDoc.writtenByStubs = {};
          serverDoc.writtenByStubs[methodId] = true;
        }
      });
    });
    if (!_.isEmpty(docsWritten)) {
      self._documentsWrittenByStub[methodId] = docsWritten;
    }
  },

  // This is very much a private function we use to make the tests
  // take up fewer server resources after they complete.
  _unsubscribeAll: function () {
    var self = this;
    _.each(_.clone(self._subscriptions), function (sub, id) {
      self._send({msg: 'unsub', id: id});
      delete self._subscriptions[id];
    });
  },

  // Sends the DDP stringification of the given message object
  _send: function (obj) {
    var self = this;
    self._stream.send(Meteor._stringifyDDP(obj));
  },

  status: function (/*passthrough args*/) {
    var self = this;
    return self._stream.status.apply(self._stream, arguments);
  },

  reconnect: function (/*passthrough args*/) {
    var self = this;
    return self._stream.reconnect.apply(self._stream, arguments);
  },

  ///
  /// Reactive user system
  ///
  userId: function () {
    var self = this;
    if (self._userIdDeps)
      Deps.depend(self._userIdDeps);
    return self._userId;
  },

  setUserId: function (userId) {
    var self = this;
    // Avoid invalidating dependents if setUserId is called with current value.
    if (self._userId === userId)
      return;
    self._userId = userId;
    if (self._userIdDeps)
      self._userIdDeps.changed();
  },

  // Returns true if we are in a state after reconnect of waiting for subs to be
  // revived or early methods to finish their data, or we are waiting for a
  // "wait" method to finish.
  _waitingForQuiescence: function () {
    var self = this;
    return (! _.isEmpty(self._subsBeingRevived) ||
            ! _.isEmpty(self._methodsBlockingQuiescence));
  },

  // Returns true if any method whose message has been sent to the server has
  // not yet invoked its user callback.
  _anyMethodsAreOutstanding: function () {
    var self = this;
    return _.any(_.pluck(self._methodInvokers, 'sentMessage'));
  },

  _livedata_connected: function (msg) {
    var self = this;

    // If this is a reconnect, we'll have to reset all stores.
    if (self._lastSessionId)
      self._resetStores = true;

    if (typeof (msg.session) === "string") {
      var reconnectedToPreviousSession = (self._lastSessionId === msg.session);
      self._lastSessionId = msg.session;
    }

    if (reconnectedToPreviousSession) {
      // Successful reconnection -- pick up where we left off.  Note that right
      // now, this never happens: the server never connects us to a previous
      // session, because DDP doesn't provide enough data for the server to know
      // what messages the client has processed. We need to improve DDP to make
      // this possible, at which point we'll probably need more code here.
      return;
    }

    // Server doesn't have our data any more. Re-sync a new session.

    // Forget about messages we were buffering for unknown collections. They'll
    // be resent if still relevant.
    self._updatesForUnknownStores = {};

    if (self._resetStores) {
      // Forget about the effects of stubs. We'll be resetting all collections
      // anyway.
      self._documentsWrittenByStub = {};
      self._serverDocuments = {};
    }

    // Clear _afterUpdateCallbacks.
    self._afterUpdateCallbacks = [];

    // Mark all named subscriptions which are ready (ie, we already called the
    // ready callback) as needing to be revived.
    // XXX We should also block reconnect quiescence until autopublish is done
    //     re-publishing to avoid flicker!
    self._subsBeingRevived = {};
    _.each(self._subscriptions, function (sub, id) {
      if (sub.ready)
        self._subsBeingRevived[id] = true;
    });

    // Arrange for "half-finished" methods to have their callbacks run, and
    // track methods that were sent on this connection so that we don't
    // quiesce until they are all done.
    //
    // Start by clearing _methodsBlockingQuiescence: methods sent before
    // reconnect don't matter, and any "wait" methods sent on the new connection
    // that we drop here will be restored by the loop below.
    self._methodsBlockingQuiescence = {};
    if (self._resetStores) {
      _.each(self._methodInvokers, function (invoker) {
        if (invoker.gotResult()) {
          // This method already got its result, but it didn't call its callback
          // because its data didn't become visible. We did not resend the
          // method RPC. We'll call its callback when we get a full quiesce,
          // since that's as close as we'll get to "data must be visible".
          self._afterUpdateCallbacks.push(_.bind(invoker.dataVisible, invoker));
        } else if (invoker.sentMessage) {
          // This method has been sent on this connection (maybe as a resend
          // from the last connection, maybe from onReconnect, maybe just very
          // quickly before processing the connected message).
          //
          // We don't need to do anything special to ensure its callbacks get
          // called, but we'll count it as a method which is preventing
          // reconnect quiescence. (eg, it might be a login method that was run
          // from onReconnect, and we don't want to see flicker by seeing a
          // logged-out state.)
          self._methodsBlockingQuiescence[invoker.methodId] = true;
        }
      });
    }

    self._messagesBufferedUntilQuiescence = [];

    // If we're not waiting on any methods or subs, we can reset the stores and
    // call the callbacks immediately.
    if (!self._waitingForQuiescence()) {
      if (self._resetStores) {
        _.each(self._stores, function (s) {
          s.beginUpdate(0, true);
          s.endUpdate();
        });
        self._resetStores = false;
      }
      self._runAfterUpdateCallbacks();
    }
  },


  _processOneDataMessage: function (msg, updates) {
    var self = this;
    // Using underscore here so as not to need to capitalize.
    self['_process_' + msg.msg](msg, updates);
  },


  _livedata_data: function (msg) {
    var self = this;

    // collection name -> array of messages
    var updates = {};

    if (self._waitingForQuiescence()) {
      self._messagesBufferedUntilQuiescence.push(msg);
      _.each(msg.subs || [], function (subId) {
        delete self._subsBeingRevived[subId];
      });
      _.each(msg.methods || [], function (methodId) {
        delete self._methodsBlockingQuiescence[methodId];
      });

      if (self._waitingForQuiescence())
        return;

      // No methods or subs are blocking quiescence!
      // We'll now process and all of our buffered messages, reset all stores,
      // and apply them all at once.
      _.each(self._messagesBufferedUntilQuiescence, function (bufferedMsg) {
        self._processOneDataMessage(bufferedMsg, updates);
      });
      self._messagesBufferedUntilQuiescence = [];
    } else {
      self._processOneDataMessage(msg, updates);
    }

    if (self._resetStores || !_.isEmpty(updates)) {
      // Begin a transactional update of each store.
      _.each(self._stores, function (s, storeName) {
        s.beginUpdate(_.has(updates, storeName) ? updates[storeName].length : 0,
                      self._resetStores);
      });
      self._resetStores = false;

      _.each(updates, function (updateMessages, storeName) {
        var store = self._stores[storeName];
        if (store) {
          _.each(updateMessages, function (updateMessage) {
            store.update(updateMessage);
          });
        } else {
          // Nobody's listening for this data. Queue it up until
          // someone wants it.
          // XXX memory use will grow without bound if you forget to
          // create a collection or just don't care about it... going
          // to have to do something about that.
          if (!_.has(self._updatesForUnknownStores, storeName))
            self._updatesForUnknownStores[storeName] = [];
          Array.prototype.push.apply(self._updatesForUnknownStores[storeName],
                                     updateMessages);
        }
      });

      // End update transaction.
      _.each(self._stores, function (s) { s.endUpdate(); });
    }

    self._runAfterUpdateCallbacks();
  },

  // Call any callbacks deferred with _runWhenAllServerDocsAreFlushed whose
  // relevant docs have been flushed, as well as dataVisible callbacks at
  // reconnect-quiescence time.
  _runAfterUpdateCallbacks: function () {
    var self = this;
    var callbacks = self._afterUpdateCallbacks;
    self._afterUpdateCallbacks = [];
    _.each(callbacks, function (c) {
      c();
    });
  },

  _pushUpdate: function (updates, collection, msg) {
    var self = this;
    if (!_.has(updates, collection)) {
      updates[collection] = [];
    }
    updates[collection].push(msg);
  },

  _process_added: function (msg, updates) {
    var self = this;
    var serverDoc = Meteor._get(self._serverDocuments, msg.collection, msg.id);
    if (serverDoc) {
      // Some outstanding stub wrote here.
      if (serverDoc.document !== undefined) {
        throw new Error("It doesn't make sense to be adding something we know exists: "
                        + msg.id);
      }
      serverDoc.document = msg.fields || {};
      serverDoc.document._id = Meteor.idParse(msg.id);
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  },

  _process_changed: function (msg, updates) {
    var self = this;
    var serverDoc = Meteor._get(self._serverDocuments, msg.collection, msg.id);
    if (serverDoc) {
      if (serverDoc.document === undefined) {
        throw new Error("It doesn't make sense to be changing something we don't think exists: "
                        + msg.id);
      }
      LocalCollection._applyChanges(serverDoc.document, msg.fields);
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  },

  _process_removed: function (msg, updates) {
    var self = this;
    var serverDoc = Meteor._get(
      self._serverDocuments, msg.collection, msg.id);
    if (serverDoc) {
      // Some outstanding stub wrote here.
      if (serverDoc.document === undefined) {
        throw new Error("It doesn't make sense to be deleting something we don't know exists: "
                        + msg.id);
      }
      serverDoc.document = undefined;
    } else {
      self._pushUpdate(updates, msg.collection, {
        msg: 'removed',
        collection: msg.collection,
        id: msg.id
      });
    }
  },

  _process_updated: function (msg, updates) {
    var self = this;
    // Process "method done" messages.
    _.each(msg.methods, function (methodId) {
      _.each(self._documentsWrittenByStub[methodId], function (written) {
        var serverDoc = Meteor._get(self._serverDocuments,
                                    written.collection, written.id);
        if (!serverDoc)
          throw new Error("Lost serverDoc for " + JSON.stringify(written));
        if (!serverDoc.writtenByStubs[methodId])
          throw new Error("Doc " + JSON.stringify(written) +
                          " not written by  method " + methodId);
        delete serverDoc.writtenByStubs[methodId];
        if (_.isEmpty(serverDoc.writtenByStubs)) {
          // All methods whose stubs wrote this method have completed! We can
          // now copy the saved document to the database (reverting the stub's
          // change if the server did not write to this object, or applying the
          // server's writes if it did).

          // This is a fake ddp 'replace' message.  It's just for talking between
          // livedata connections and minimongo.
          self._pushUpdate(updates, written.collection, {
            msg: 'replace',
            id: written.id,
            replace: serverDoc.document
          });
          // Call all flush callbacks.
          _.each(serverDoc.flushCallbacks, function (c) {
            c();
          });

          // Delete this completed serverDocument. Don't bother to GC empty
          // objects inside self._serverDocuments, since there probably aren't
          // many collections and they'll be written repeatedly.
          delete self._serverDocuments[written.collection][written.id];
        }
      });
      delete self._documentsWrittenByStub[methodId];

      // We want to call the data-written callback, but we can't do so until all
      // currently buffered messages are flushed.
      var callbackInvoker = self._methodInvokers[methodId];
      if (!callbackInvoker)
        throw new Error("No callback invoker for method " + methodId);
      self._runWhenAllServerDocsAreFlushed(
        _.bind(callbackInvoker.dataVisible, callbackInvoker));
    });
  },

  _process_ready: function (msg, updates) {
    var self = this;
    // Process "sub ready" messages. "sub ready" messages don't take effect
    // until all current server documents have been flushed to the local
    // database. We can use a write fence to implement this.
    _.each(msg.subs, function (subId) {
      self._runWhenAllServerDocsAreFlushed(function () {
        var subRecord = self._subscriptions[subId];
        // Did we already unsubscribe?
        if (!subRecord)
          return;
        // Did we already receive a ready message? (Oops!)
        if (subRecord.ready)
          return;
        subRecord.readyCallback && subRecord.readyCallback();
        subRecord.ready = true;
        subRecord.readyDeps && subRecord.readyDeps.changed();
      });
    });
  },

  // Ensures that "f" will be called after all documents currently in
  // _serverDocuments have been written to the local cache. f will not be called
  // if the connection is lost before then!
  _runWhenAllServerDocsAreFlushed: function (f) {
    var self = this;
    var runFAfterUpdates = function () {
      self._afterUpdateCallbacks.push(f);
    };
    var unflushedServerDocCount = 0;
    var onServerDocFlush = function () {
      --unflushedServerDocCount;
      if (unflushedServerDocCount === 0) {
        // This was the last doc to flush! Arrange to run f after the updates
        // have been applied.
        runFAfterUpdates();
      }
    };
    _.each(self._serverDocuments, function (collectionDocs) {
      _.each(collectionDocs, function (serverDoc) {
        var writtenByStubForAMethodWithSentMessage = _.any(
          serverDoc.writtenByStubs, function (dummy, methodId) {
            var invoker = self._methodInvokers[methodId];
            return invoker && invoker.sentMessage;
          });
        if (writtenByStubForAMethodWithSentMessage) {
          ++unflushedServerDocCount;
          serverDoc.flushCallbacks.push(onServerDocFlush);
        }
      });
    });
    if (unflushedServerDocCount === 0) {
      // There aren't any buffered docs --- we can call f as soon as the current
      // round of updates is applied!
      runFAfterUpdates();
    }
  },

  _livedata_nosub: function (msg) {
    var self = this;
    // we weren't subbed anyway, or we initiated the unsub.
    if (!_.has(self._subscriptions, msg.id))
      return;
    var errorCallback = self._subscriptions[msg.id].errorCallback;
    delete self._subscriptions[msg.id];
    if (errorCallback && msg.error) {
      errorCallback(new Meteor.Error(
        msg.error.error, msg.error.reason, msg.error.details));
    }
  },

  _livedata_result: function (msg) {
    // id, result or error. error has error (code), reason, details

    var self = this;

    // find the outstanding request
    // should be O(1) in nearly all realistic use cases
    if (_.isEmpty(self._outstandingMethodBlocks)) {
      Meteor._debug("Received method result but no methods outstanding");
      return;
    }
    var currentMethodBlock = self._outstandingMethodBlocks[0].methods;
    var m;
    for (var i = 0; i < currentMethodBlock.length; i++) {
      m = currentMethodBlock[i];
      if (m.methodId === msg.id)
        break;
    }

    if (!m) {
      Meteor._debug("Can't match method response to original method call", msg);
      return;
    }

    // Remove from current method block. This may leave the block empty, but we
    // don't move on to the next block until the callback has been delivered, in
    // _outstandingMethodFinished.
    currentMethodBlock.splice(i, 1);

    if (_.has(msg, 'error')) {
      m.receiveResult(new Meteor.Error(
        msg.error.error, msg.error.reason,
        msg.error.details));
    } else {
      // msg.result may be undefined if the method didn't return a
      // value
      m.receiveResult(undefined, msg.result);
    }
  },

  // Called by MethodInvoker after a method's callback is invoked.  If this was
  // the last outstanding method in the current block, runs the next block. If
  // there are no more methods, consider accepting a hot code push.
  _outstandingMethodFinished: function () {
    var self = this;
    if (self._anyMethodsAreOutstanding())
      return;

    // No methods are outstanding. This should mean that the first block of
    // methods is empty. (Or it might not exist, if this was a method that
    // half-finished before disconnect/reconnect.)
    if (! _.isEmpty(self._outstandingMethodBlocks)) {
      var firstBlock = self._outstandingMethodBlocks.shift();
      if (! _.isEmpty(firstBlock.methods))
        throw new Error("No methods outstanding but nonempty block: " +
                        JSON.stringify(firstBlock));

      // Send the outstanding methods now in the first block.
      if (!_.isEmpty(self._outstandingMethodBlocks))
        self._sendOutstandingMethods();
    }

    // Maybe accept a hot code push.
    self._maybeMigrate();
  },

  // Sends messages for all the methods in the first block in
  // _outstandingMethodBlocks.
  _sendOutstandingMethods: function() {
    var self = this;
    if (_.isEmpty(self._outstandingMethodBlocks))
      return;
    _.each(self._outstandingMethodBlocks[0].methods, function (m) {
      m.sendMessage();
    });
  },

  _livedata_error: function (msg) {
    Meteor._debug("Received error from server: ", msg.reason);
    if (msg.offendingMessage)
      Meteor._debug("For: ", msg.offendingMessage);
  },

  _callOnReconnectAndSendAppropriateOutstandingMethods: function() {
    var self = this;
    var oldOutstandingMethodBlocks = self._outstandingMethodBlocks;
    self._outstandingMethodBlocks = [];

    self.onReconnect();

    if (_.isEmpty(oldOutstandingMethodBlocks))
      return;

    // We have at least one block worth of old outstanding methods to try
    // again. First: did onReconnect actually send anything? If not, we just
    // restore all outstanding methods and run the first block.
    if (_.isEmpty(self._outstandingMethodBlocks)) {
      self._outstandingMethodBlocks = oldOutstandingMethodBlocks;
      self._sendOutstandingMethods();
      return;
    }

    // OK, there are blocks on both sides. Special case: merge the last block of
    // the reconnect methods with the first block of the original methods, if
    // neither of them are "wait" blocks.
    if (!_.last(self._outstandingMethodBlocks).wait &&
        !oldOutstandingMethodBlocks[0].wait) {
      _.each(oldOutstandingMethodBlocks[0].methods, function (m) {
        _.last(self._outstandingMethodBlocks).methods.push(m);

        // If this "last block" is also the first block, send the message.
        if (self._outstandingMethodBlocks.length === 1)
          m.sendMessage();
      });

      oldOutstandingMethodBlocks.shift();
    }

    // Now add the rest of the original blocks on.
    _.each(oldOutstandingMethodBlocks, function (block) {
      self._outstandingMethodBlocks.push(block);
    });
  },

  // We can accept a hot code push if there are no methods in flight.
  _readyToMigrate: function() {
    var self = this;
    return _.isEmpty(self._methodInvokers);
  },

  // If we were blocking a migration, see if it's now possible to continue.
  // Call whenever the set of outstanding/blocked methods shrinks.
  _maybeMigrate: function () {
    var self = this;
    if (self._retryMigrate && self._readyToMigrate()) {
      self._retryMigrate();
      self._retryMigrate = null;
    }
  }
});

_.extend(Meteor, {
  // @param url {String} URL to Meteor app,
  //     e.g.:
  //     "subdomain.meteor.com",
  //     "http://subdomain.meteor.com",
  //     "/",
  //     "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
  connect: function (url, _reloadOnUpdate) {
    var ret = new Meteor._LivedataConnection(
      url, {reloadOnUpdate: _reloadOnUpdate});
    Meteor._LivedataConnection._allConnections.push(ret); // hack. see below.
    return ret;
  }
});

// Hack for `spiderable` package: a way to see if the page is done
// loading all the data it needs.
Meteor._LivedataConnection._allConnections = [];
Meteor._LivedataConnection._allSubscriptionsReady = function () {
  return _.all(Meteor._LivedataConnection._allConnections, function (conn) {
    return _.all(conn._subscriptions, function (sub) {
      return sub.ready;
    });
  });
};
})();
