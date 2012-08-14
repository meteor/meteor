if (Meteor.is_server) {
  // XXX namespacing
  var Future = __meteor_bootstrap__.require('fibers/future');
}

// list of subscription tokens outstanding during a
// captureDependencies run. only set when we're doing a run. The fact
// that this is a singleton means we can't do recursive
// Meteor.subscriptions(). But what would that even mean?
// XXX namespacing
Meteor._capture_subs = null;

// @param url {String|Object} URL to Meteor app or sockjs endpoint (deprecated),
//     or an object as a test hook (see code)
Meteor._LivedataConnection = function (url, restart_on_update) {
  var self = this;

  // as a test hook, allow passing a stream instead of a url.
  if (typeof url === "object") {
    self.stream = url;
    // if we have two test streams, auto reload stuff will break because
    // the url is used as a key for the migration data.
    self.url = "/debug";
  } else {
    self.url = url;
  }

  self.last_session_id = null;
  self.stores = {}; // name -> object with methods
  self.method_handlers = {}; // name -> func
  self.next_method_id = 1;

  // --- Three classes of outstanding methods ---

  // 1. either already sent, or waiting to be sent with no special
  // consideration once we reconnect
  self.outstanding_methods = []; // each item has keys: msg, callback

  // 2. the sole outstanding method that needs to be waited on, or null
  // same keys as outstanding_methods (notably wait is implicitly true
  // but not set)
  self.outstanding_wait_method = null; // same keys as outstanding_methods
  // stores response from `outstanding_wait_method` while we wait for
  // previous method calls to complete, as received in _livedata_result
  self.outstanding_wait_method_response = null;

  // 3. methods blocked on outstanding_wait_method being completed.
  self.blocked_methods = []; // each item has keys: msg, callback, wait

  // if set, called when we reconnect, queuing method calls _before_
  // the existing outstanding ones
  self.onReconnect = null;
  // waiting for data from method
  self.unsatisfied_methods = {}; // map from method_id -> true
  // sub was ready, is no longer (due to reconnect)
  self.unready_subscriptions = {}; // map from sub._id -> true
  // messages from the server that have not been applied
  self.pending_data = []; // array of pending data messages
  // name -> updates for (yet to be created) collection
  self.queued = {};
  // if we're blocking a migration, the retry func
  self.retry_migrate = null;

  // metadata for subscriptions
  self.subs = new LocalCollection;
  // keyed by subs._id. value is unset or an array. if set, sub is not
  // yet ready.
  self.sub_ready_callbacks = {};

  // just for testing
  self.quiesce_callbacks = [];

  var reload_key = "Server-" + url;
  Meteor._reload.on_migrate(reload_key, function (retry) {
    if (!self._readyToMigrate()) {
      if (self.retry_migrate)
        throw new Error("Two migrations in progress?");
      self.retry_migrate = retry;
      return false;
    } else {
      return [true];
    }
  });

  // Setup stream (if not overriden above)
  self.stream = self.stream || new Meteor._Stream(self.url);

  self.stream.on('message', function (raw_msg) {
    try {
      var msg = JSON.parse(raw_msg);
    } catch (err) {
      Meteor._debug("discarding message with invalid JSON", raw_msg);
      return;
    }
    if (typeof msg !== 'object' || !msg.msg) {
      Meteor._debug("discarding invalid livedata message", msg);
      return;
    }

    if (msg.msg === 'connected')
      self._livedata_connected(msg);
    else if (msg.msg === 'data')
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

  self.stream.on('reset', function () {
    // Send a connect message at the beginning of the stream.
    // NOTE: reset is called even on the first connection, so this is
    // the only place we send this message.
    var msg = {msg: 'connect'};
    if (self.last_session_id)
      msg.session = self.last_session_id;
    self.stream.send(JSON.stringify(msg));

    // Now, to minimize setup latency, go ahead and blast out all of
    // our pending methods ands subscriptions before we've even taken
    // the necessary RTT to know if we successfully reconnected. (1)
    // They're supposed to be idempotent; (2) even if we did
    // reconnect, we're not sure what messages might have gotten lost
    // (in either direction) since we were disconnected (TCP being
    // sloppy about that.)

    // XXX we may have an issue where we lose 'data' messages sent
    // immediately before disconnection.. do we need to add app-level
    // acking of data messages?

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
    self.subs.find().forEach(function (sub) {
      self.stream.send(JSON.stringify(
        {msg: 'sub', id: sub._id, name: sub.name, params: sub.args}));
    });
  });

  if (restart_on_update) {
    self.stream.on('update_available', function () {
      // Start trying to migrate to a new version. Until all packages
      // signal that they're ready for a migration, the app will
      // continue running normally.
      Meteor._reload.reload();
    });
  }

  // we never terminate the observe(), since there is no way to
  // destroy a LivedataConnection.. but this shouldn't matter, since we're
  // the only one that holds a reference to the self.subs collection
  self.subs_token = self.subs.find({}).observe({
    added: function (sub) {
      self.stream.send(JSON.stringify({
        msg: 'sub', id: sub._id, name: sub.name, params: sub.args}));
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { self.subs.remove({_id: sub._id}); });
      }
    },
    removed: function (obj) {
      self.stream.send(JSON.stringify({msg: 'unsub', id: obj._id}));
    }
  });
};

_.extend(Meteor._LivedataConnection.prototype, {
  // 'name' is the name of the data on the wire that should go in the
  // store. 'store' should be an object with methods beginUpdate,
  // update, endUpdate, reset. see Collection for an example.
  registerStore: function (name, store) {
    var self = this;

    if (name in self.stores)
      return false;
    self.stores[name] = store;

    store.beginUpdate();
    _.each(self.queued[name] || [], function (msg) {
      store.update(msg);
    });
    store.endUpdate();
    delete self.queued[name];

    return true;
  },

  subscribe: function (name /* .. [arguments] .. callback */) {
    var self = this;
    var id;

    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();

    var existing = self.subs.find({name: name, args: args}, {reactive: false}).fetch();

    if (existing && existing[0]) {
      // already subbed, inc count.
      id = existing[0]._id;
      self.subs.update({_id: id}, {$inc: {count: 1}});

      if (callback) {
        if (self.sub_ready_callbacks[id])
          self.sub_ready_callbacks[id].push(callback);
        else
          callback(); // XXX maybe _.defer?
      }
    } else {
      // new sub, add object.
      // generate our own id so we can know it w/ a find afterwards.
      id = LocalCollection.uuid();
      self.subs.insert({_id: id, name: name, args: args, count: 1});

      self.sub_ready_callbacks[id] = [];

      if (callback)
        self.sub_ready_callbacks[id].push(callback);
    }

    // return an object with a stop method.
    var token = {stop: function () {
      if (!id) return; // must have an id (local from above).
      // just update the database. observe takes care of the rest.
      self.subs.update({_id: id}, {$inc: {count: -1}});
    }};

    if (Meteor._capture_subs)
      Meteor._capture_subs.push(token);

    return token;
  },

  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self.method_handlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self.method_handlers[name] = func;
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
  //   wait: Boolean - Should we block subsequent method calls on this
  //                   method's result having been received?
  //                   (does not affect methods called from within this method)
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
                      name + "'", e.stack);
      });
    }

    if (Meteor.is_client) {
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
      var stub = self.method_handlers[name];
      if (stub) {
        var setUserId = function(userId) {
          self.setUserId(userId);
        };
        var invocation = new Meteor._MethodInvocation(
          true /* is_simulation */, self.userId(), setUserId);
        try {
          var ret = Meteor._CurrentInvocation.withValue(invocation,function () {
            return stub.apply(invocation, args);
          });
        }
        catch (e) {
          var exception = e;
        }
      }

      // If we're in a simulation, stop and return the result we have,
      // rather than going on to do an RPC. If there was no stub,
      // we'll end up returning undefined.
      var enclosing = Meteor._CurrentInvocation.get();
      var is_simulation = enclosing && enclosing.is_simulation;
      if (is_simulation) {
        if (callback) {
          callback(exception, ret);
          return;
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
      if (exception && !exception.expected)
        Meteor._debug("Exception while simulating the effect of invoking '" +
                      name + "'", exception.stack);
    }

    // At this point we're definitely doing an RPC, and we're going to
    // return the value of the RPC to the caller.

    // If the caller didn't give a callback, decide what to do.
    if (!callback) {
      if (Meteor.is_client)
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
    // stub have finished before we send the RPC (or at least we need
    // to guaranteed that the snapshot is not restored until the stub
    // has stopped doing writes.)
    var msg = {
      msg: 'method',
      method: name,
      params: args,
      id: '' + (self.next_method_id++)
    };

    if (self.outstanding_wait_method) {
      self.blocked_methods.push({
        msg: msg,
        callback: callback,
        wait: options.wait
      });
    } else {
      var method_object = {
        msg: msg,
        callback: callback
      };

      if (options.wait)
        self.outstanding_wait_method = method_object;
      else
        self.outstanding_methods.push(method_object);

      self.stream.send(JSON.stringify(msg));
    }

    // Even if we are waiting on other method calls mark this method
    // as unsatisfied so that the user never ends up seeing
    // intermediate versions of the server's datastream
    self.unsatisfied_methods[msg.id] = true;

    // If we're using the default callback on the server,
    // synchronously return the result from the remote host.
    if (future) {
      var outcome = future.wait();
      if (outcome[0])
        throw outcome[0];
      return outcome[1];
    }
  },

  status: function (/*passthrough args*/) {
    var self = this;
    return self.stream.status.apply(self.stream, arguments);
  },

  reconnect: function (/*passthrough args*/) {
    var self = this;
    return self.stream.reconnect.apply(self.stream, arguments);
  },

  ///
  /// Reactive user system
  /// XXX Can/should this be generalized pattern?
  ///
  userId: function () {
    var self = this;
    var context = Meteor.deps && Meteor.deps.Context.current;
    if (context && !(context.id in self._userIdListeners)) {
      self._userIdListeners[context.id] = context;
      context.on_invalidate(function () {
        delete self._userIdListeners[context.id];
      });
    }
    return self._userId;
  },

  setUserId: function (userId) {
    var self = this;
    self._userId = userId;
    _.each(self._userIdListeners, function (context) {
      context.invalidate();
    });
  },

  _userId: null,
  _userIdListeners: {}, // context.id -> context

  // PRIVATE: called when we are up-to-date with the server. intended
  // for use only in tests. currently, you are very limited in what
  // you may do inside your callback -- in particular, don't do
  // anything that could result in another call to onQuiesce, or
  // results are undefined.
  onQuiesce: function (f) {
    var self = this;

    f = Meteor.bindEnvironment(f, function (e) {
      Meteor._debug("Exception in quiesce callback", e.stack);
    });

    for (var method_id in self.unsatisfied_methods) {
      // we are not quiesced -- wait until we are
      self.quiesce_callbacks.push(f);
      return;
    }

    f();
  },

  _livedata_connected: function (msg) {
    var self = this;

    if (typeof (msg.session) === "string") {
      var reconnected = (self.last_session_id === msg.session);
      self.last_session_id = msg.session;
    }

    if (reconnected)
      // successful reconnection -- pick up where we left off.
      return;

    // Server doesn't have our data any more. Re-sync a new session.

    // Put a reset message into the pending data queue and discard any
    // previous messages (they are unimportant now).
    self.pending_data = ["reset"];
    self.queued = {};

    // Mark all currently ready subscriptions as 'unready'.
    var all_subs = self.subs.find({}).fetch();
    self.unready_subscriptions = {};
    _.each(all_subs, function (sub) {
      if (!self.sub_ready_callbacks[sub._id])
        self.unready_subscriptions[sub._id] = true;
    });

    // Do not clear the database here. That happens once all the subs
    // are re-ready and we process pending_data.
  },

  _livedata_data: function (msg) {
    var self = this;

    // Add the data message to the queue
    self.pending_data.push(msg);

    // Process satisfied methods and subscriptions.
    // NOTE: does not fire callbacks here, that happens when
    // the data message is processed for real. This is just for
    // quiescing.
    _.each(msg.methods || [], function (method_id) {
      delete self.unsatisfied_methods[method_id];
    });
    _.each(msg.subs || [], function (sub_id) {
      delete self.unready_subscriptions[sub_id];
    });

    // If there are still method invocations in flight, stop
    for (var method_id in self.unsatisfied_methods)
      return;
    // If there are still uncomplete subscriptions, stop
    for (var sub_id in self.unready_subscriptions)
      return;

    // We have quiesced. Blow away local changes and replace
    // with authoritative changes from server.

    _.each(self.stores, function (s) { s.beginUpdate(); });

    _.each(self.pending_data, function (msg) {
      // Reset message from reconnect. Blow away everything.
      //
      // XXX instead of reset message, we could have a flag, and pass
      // that to beginUpdate. This would be more efficient since we don't
      // have to restore a snapshot if we're just going to blow away the
      // db.
      if (msg === "reset") {
        _.each(self.stores, function (s) { s.reset(); });
        return;
      }

      if (msg.collection && msg.id) {
        var store = self.stores[msg.collection];

        if (!store) {
          // Nobody's listening for this data. Queue it up until
          // someone wants it.
          // XXX memory use will grow without bound if you forget to
          // create a collection.. going to have to do something about
          // that.
          if (!(msg.collection in self.queued))
            self.queued[msg.collection] = [];
          self.queued[msg.collection].push(msg);
          return;
        }

        store.update(msg);
      }

      if (msg.subs) {
        _.each(msg.subs, function (id) {
          var arr = self.sub_ready_callbacks[id];
          if (arr) _.each(arr, function (c) { c(); });
          delete self.sub_ready_callbacks[id];
        });
      }
    });

    _.each(self.stores, function (s) { s.endUpdate(); });

    _.each(self.quiesce_callbacks, function (cb) { cb(); });
    self.quiesce_callbacks = [];

    self.pending_data = [];
  },

  _livedata_nosub: function (msg) {
    var self = this;
    // Meteor._debug("NOSUB", msg);
  },

  _livedata_result: function (msg) {
    // id, result or error. error has error (code), reason, details

    var self = this;
    // find the outstanding request
    // should be O(1) in nearly all realistic use cases
    var m;
    if (self.outstanding_wait_method &&
        self.outstanding_wait_method.msg.id === msg.id) {
      m = self.outstanding_wait_method;
      self.outstanding_wait_method_response = msg;
    } else {
      for (var i = 0; i < self.outstanding_methods.length; i++) {
        m = self.outstanding_methods[i];
        if (m.msg.id === msg.id)
          break;
      }

      // remove
      self.outstanding_methods.splice(i, 1);
    }

    if (!m) {
      Meteor._debug("Can't match method response to original method call", msg);
      return;
    }

    if (self.outstanding_wait_method) {
      // Wait until we have completed all outstanding methods.
      if (self.outstanding_methods.length === 0 &&
         self.outstanding_wait_method_response) {

        // Start by saving the outstanding wait method details, since
        // we're going to reshift the blocked ones and try to send
        // them *before* calling the method callback. It is necessary
        // to call method callbacks last since they might themselves
        // call other methods
        var savedOutstandingWaitMethod = self.outstanding_wait_method;
        var savedOutstandingWaitMethodResponse = self.outstanding_wait_method_response;
        self.outstanding_wait_method_response = null;
        self.outstanding_wait_method = null;

        // Find first blocked method with wait: true
        var i;
        for (i = 0; i < self.blocked_methods.length; i++)
          if (self.blocked_methods[i].wait)
            break;

        // Move as many blocked methods as we can into
        // outstanding_methods and outstanding_wait_method if needed
        self.outstanding_methods = _.first(self.blocked_methods, i);
        if (i !== self.blocked_methods.length) {
          self.outstanding_wait_method = self.blocked_methods[i];
          self.blocked_methods = _.rest(self.blocked_methods, i+1);
        }

        // Send any new outstanding methods after we reshift the
        // blocked methods.  Intentionally do this before calling the
        // method response because they might call additional methods
        // that shouldn't be sent twice.
        self._sendOutstandingMethods();

        // Fire necessary outstanding method callbacks, making sure we
        // only fire the outstanding wait method after all other outstanding
        // methods' callbacks were fired
        if (m === savedOutstandingWaitMethod) {
          self._deliverMethodResponse(savedOutstandingWaitMethod,
                       savedOutstandingWaitMethodResponse /*(=== msg)*/);
        } else {
          self._deliverMethodResponse(m, msg);
          self._deliverMethodResponse(savedOutstandingWaitMethod,
                       savedOutstandingWaitMethodResponse /*(!== msg)*/);
        }
      } else {
        if (m !== self.outstanding_wait_method)
          self._deliverMethodResponse(m, msg);
      }
    } else {
      self._deliverMethodResponse(m, msg);
    }

    // if we were blocking a migration, see if it's now possible to
    // continue
    if (self.retry_migrate && self._readyToMigrate()) {
      self.retry_migrate();
      self.retry_migrate = null;
    }
  },

  // @param method {Object} as in `outstanding_methods`
  // @param response {Object{id, result | error}}
  _deliverMethodResponse: function(method, response) {
    // callback will have already been bindEnvironment'd by apply(),
    // so no need to catch exceptions
    if ('error' in response) {
      method.callback(new Meteor.Error(
        response.error.error, response.error.reason,
        response.error.details));
    } else {
      // msg.result may be undefined if the method didn't return a
      // value
      method.callback(undefined, response.result);
    }
  },

  _sendOutstandingMethods: function() {
    var self = this;
    _.each(self.outstanding_methods, function (m) {
      self.stream.send(JSON.stringify(m.msg));
    });
    if (self.outstanding_wait_method)
      self.stream.send(JSON.stringify(self.outstanding_wait_method.msg));
  },

  _livedata_error: function (msg) {
    Meteor._debug("Received error from server: ", msg.reason);
    if (msg.offending_message)
      Meteor._debug("For: ", msg.offending_message);
  },

  _callOnReconnectAndSendAppropriateOutstandingMethods: function() {
    var self = this;
    var old_outstanding_methods = self.outstanding_methods;
    var old_outstanding_wait_method = self.outstanding_wait_method;
    var old_blocked_methods = self.blocked_methods;
    self.outstanding_methods = [];
    self.outstanding_wait_method = null;
    self.blocked_methods = [];

    self.onReconnect();

    if (self.outstanding_wait_method) {
      // self.onReconnect() caused us to wait on a method. Add all old
      // methods to blocked_methods, and we don't need to send any
      // additional methods
      self.blocked_methods = self.blocked_methods.concat(
        old_outstanding_methods);

      if (old_outstanding_wait_method) {
        self.blocked_methods.push(_.extend(
          old_outstanding_wait_method, {wait: true}));
      }

      self.blocked_methods = self.blocked_methods.concat(
        old_blocked_methods);
    } else {
      // self.onReconnect() did not cause us to wait on a method. Add
      // as many methods as we can to outstanding_methods and send
      // them
      _.each(old_outstanding_methods, function(method) {
        self.outstanding_methods.push(method);
        self.stream.send(JSON.stringify(method.msg));
      });

      self.outstanding_wait_method = old_outstanding_wait_method;
      if (self.outstanding_wait_method)
        self.stream.send(JSON.stringify(self.outstanding_wait_method.msg));

      self.blocked_methods = old_blocked_methods;
    }
  },

  _readyToMigrate: function() {
    var self = this;
    return self.outstanding_methods.length === 0 &&
      !self.outstanding_wait_method &&
      self.blocked_methods.length === 0;
  }
});

_.extend(Meteor, {
  // @param url {String} URL to Meteor app, or to sockjs endpoint (deprecated),
  //     e.g.:
  //     "subdomain.meteor.com",
  //     "http://subdomain.meteor.com",
  //     "/",
  //     "http://subdomain.meteor.com/sockjs" (deprecated),
  //     "/sockjs" (deprecated)
  connect: function (url, _restartOnUpdate) {
    var ret = new Meteor._LivedataConnection(url, _restartOnUpdate);
    Meteor._LivedataConnection._allConnections.push(ret); // hack. see below.
    return ret;
  },

  autosubscribe: function (sub_func) {
    var local_subs = [];
    var context = new Meteor.deps.Context();

    context.on_invalidate(function () {
      // recurse.
      Meteor.autosubscribe(sub_func);
      // unsub after re-subbing, to avoid bouncing.
      _.each(local_subs, function (x) { x.stop(); });
    });

    context.run(function () {
      if (Meteor._capture_subs)
        throw new Error("Meteor.autosubscribe may not be called recursively");

      Meteor._capture_subs = [];
      try {
        sub_func();
      } finally {
        local_subs = Meteor._capture_subs;
        Meteor._capture_subs = null;
      }
    });
  }
});


// Hack for `spiderable` package: a way to see if the page is done
// loading all the data it needs.
Meteor._LivedataConnection._allConnections = [];
Meteor._LivedataConnection._allSubscriptionsReady = function () {
  return _.all(Meteor._LivedataConnection._allConnections, function (conn) {
    for (var k in conn.sub_ready_callbacks)
      return false;
    return true;
  });
};
