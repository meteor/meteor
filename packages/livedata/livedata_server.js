/******************************************************************************/
/* ServerMethodInvocation                                                     */
/******************************************************************************/

Meteor._ServerMethodInvocation = function (name, handler) {
  var self = this;

  self._enclosing = null;
  self.isSimulation = null;
  self._name = name;
  self._handler = handler;
  self._async = false;
  self._responded = false;
  self._autoresponded = false;
  self._threw = false;
  self._callback = null;
  self._next = null;
  self._calledNext = false;
};

_.extend(Meteor._ServerMethodInvocation.prototype, {
  beginAsync: function (okToContinue) {
    var self = this;

    if (okToContinue === undefined)
      okToContinue = true;

    if (self.isSimulation)
      // XXX need a much better error message!
      // duplicated in livedata_connection
      throw new Error("Simulated methods may not be asynchronous");
    else if (self._responded)
      throw new Error("The method has already returned, so it is too late " +
                      "to mark it as asynchronous");
    else {
      self._async = true;
      if (okToContinue && !self._calledNext) {
        self._calledNext = true;
        self._next && self._next();
      }
    }
  },

  respond: function (ret) {
    this._sendResponse(undefined, ret, "async");
  },

  error: function (code, message) {
    this._sendResponse({error: code, reason: message}, undefined, "async");
  },

  // from: "async", "sync", or "throw".
  // self._threw is set by _run, and indicates that we're about to
  // report an exception and not to allow any other fibers kicked off by
  // the method to emit data.

  _sendResponse: function (error, ret, from) {
    var self = this;

    if (from === "throw")
      self._threw = true;

    if (self._threw && from !== "throw")
      // this is a different fiber.  don't emit data, don't print an error.
      return;

    if (self._responded) {
      // another fiber already reported a result to the client.  if
      // this fiber is throwing an exception, there's nothing left to do,
      // since methods can only return a single result.  the exception
      // has already been logged.  otherwise, throw an error: the user's
      // code is responding more than once.
      if (from === "throw")
        return;
      if (self._autoresponded)
        throw new Error(
          "The method has already returned, so it is too late to call " +
            "respond() or error(). If you want to respond asynchronously, " +
            "first use beginAsync() to prevent a response from being " +
            "automatically sent.");
      else
        throw new Error(
          "respond() or error() may only be called once per request");
    }
    self._responded = true;
    self._autoresponded = (from === "sync");

    // if we haven't yet yielded to the next method in the queue, do
    // that now, just before sending the response.
    if (!self._calledNext) {
      self._calledNext = true;
      self._next && self._next();
    }

    // call the callback.  should happen exactly once per method.
    self._callback && self._callback(error, ret);
  },

  // entry point
  // - returns the immediate value (or throws an exception)
  // - in any case, calls callback (if truthy) with eventual result
  // - caller should call bindEnvironment on callback, or otherwise handle
  //   any exceptions it throws
  // - 'name' is for exception reporting
  // - 'next' will be called when it's OK to start the next method from
  //   this client
  _run: function (args, callback, next) {
    var self = this;
    self._callback = callback;
    self._next = next;
    self._enclosing = Meteor._CurrentInvocation.get();
    self.isSimulation = !!(self._enclosing && self._enclosing.isSimulation);

    try {
      var ret = Meteor._CurrentInvocation.withValue(self, function () {
        return self._handler.apply(self, args);
      });
      if (!self._responded && !self._async)
        self._sendResponse(undefined, ret, "sync");
      return ret;
    } catch (e) {
      // send response in "throw" mode, which will lock out any other
      // fibers kicked off by this method from emitting a response.
      self._sendResponse({error: 500, reason: "Internal server error"},
                         undefined, "throw");
      // XXX improve error message (and how we report it)
      if (!e.expected)
        // tests can set the 'expected' flag on an exception so it
        // won't go to the server log
        Meteor._debug("Exception while invoking method '" +
                      self._name + "'", e.stack);
      throw e;
    }
  }
});

/******************************************************************************/
/* LivedataSession                                                            */
/******************************************************************************/

Meteor._LivedataSession = function (socket, server) {
  var self = this;
  self.id = Meteor.uuid();

  self.socket = socket;
  self.server = server;

  self.methods_blocked = false;
  self.method_queue = [];

  // Sub objects for active subscriptions
  self.named_subs = {};
  self.universal_subs = [];
};

_.extend(Meteor._LivedataSession.prototype, {
  startSubscription: function (handler, sub_id, params) {
    var self = this;

    var sub = new Meteor._LivedataSubscription(self.socket, sub_id);
    if (sub_id)
      self.named_subs[sub_id] = sub;
    else
      self.universal_subs.push(sub);

    var res = handler(sub, params);

    // automatically wire up handlers that return a Cursor.
    // otherwise, the handler is completely responsible for delivering
    // its own data messages and registering stop functions.
    if (res instanceof _Mongo.Cursor) // XXX generalize
      sub._publishCursor(res);
  },

  // tear down specified subscription
  stopSubscription: function (sub_id) {
    var self = this;

    if (sub_id && self.named_subs[sub_id]) {
      self.named_subs[sub_id].stop();
      delete self.named_subs[sub_id];
    }
  },

  // tear down all subscriptions
  stopAllSubscriptions: function () {
    var self = this;

    _.each(self.named_subs, function (sub, id) {
      sub.stop();
    });
    self.named_subs = {};

    _.each(self.universal_subs, function (sub) {
      sub.stop();
    });
    self.universal_subs = [];
  },

  enqueueMethod: function (msg) {
    var self = this;
    self.method_queue.push(msg);
    self._tryInvokeNext();
  },

  _tryInvokeNext: function () {
    var self = this;

    // Invoke methods one at a time, in the order sent by the client
    // -- invocations sent by a given client block later invocations
    // sent by the same client, unless the method explicitly allows
    // later methods to run by calling beginAsync(true).

    if (self.methods_blocked)
      return;
    var msg = self.method_queue.shift();
    if (!msg)
      return;

    self.methods_blocked = true;
    Fiber(function () {
      var next = function (error, ret) {
        self.methods_blocked = false;
        _.defer(_.bind(self._tryInvokeNext, self));
      };

      var handler = self.server.method_handlers[msg.method];
      if (!handler) {
        self.socket.send(JSON.stringify({
          msg: 'result', id: msg.id,
          error: {error: 404, reason: "Method not found"}}));
        self.socket.send(JSON.stringify({
          msg: 'data', methods: [msg.id]}));
        next();
        return;
      }

      var callback = function (error, result) {
        if (error)
          self.socket.send(JSON.stringify({
            msg: 'result', id: msg.id, error: error}));
        else
          self.socket.send(JSON.stringify({
            msg: 'result', id: msg.id, result: result}));

        // the method is satisfied once callback is called, because
        // any DB observe callbacks run to completion in the same
        // tick.
        self.socket.send(JSON.stringify({
          msg: 'data', methods: [msg.id]}));
      };

      var invocation = new Meteor._ServerMethodInvocation(msg.method, handler);
      try {
        invocation._run(msg.params || [], callback, next);
      } catch (e) {
        // _run will have already logged the exception (and told the
        // client, if appropriate)
      }
    }).run();
  },

});

/******************************************************************************/
/* LivedataSubscription                                                       */
/******************************************************************************/

// ctor for a sub handle: the input to each publish function
Meteor._LivedataSubscription = function (socket, sub_id) {
  // transport.  provides send(obj).
  this.socket = socket;

  // my subscription ID (generated by client, null for universal subs).
  this.sub_id = sub_id;

  // unsent DDP messages.
  this.pending_updates = {};
  this.pending_complete = false;

  // stop callbacks to g/c this sub.  called w/ zero arguments.
  this.stop_callbacks = [];
};

_.extend(Meteor._LivedataSubscription.prototype, {
  stop: function () {
    for (var i = 0; i < this.stop_callbacks.length; i++)
      (this.stop_callbacks[i])();
  },

  onStop: function (callback) {
    this.stop_callbacks.push(callback);
  },

  _ensureMsg: function (collection_name, id) {
    var self = this;
    if (!self.pending_updates[collection_name])
      self.pending_updates[collection_name] = {};
    if (!self.pending_updates[collection_name][id])
      self.pending_updates[collection_name][id] = {msg: 'data', collection: collection_name, id: id};
    return self.pending_updates[collection_name][id];
  },

  set: function (collection_name, id, dictionary) {
    var self = this;
    var obj = _.extend({}, dictionary);
    delete obj._id;
    var msg = self._ensureMsg(collection_name, id);
    msg.set = _.extend(msg.set || {}, obj);

    if (msg.unset) {
      msg.unset = _.difference(msg.unset, _.keys(msg.set));
      if (!msg.unset.length)
        delete msg.unset;
    }
  },

  unset: function (collection_name, id, keys) {
    var self = this;
    keys = _.without(keys, '_id');
    var msg = self._ensureMsg(collection_name, id);
    msg.unset = _.union(msg.unset || [], keys);

    if (msg.set) {
      for (var key in keys)
        delete msg.set[key];
      if (!_.keys(msg.set))
        delete msg.set;
    }
  },

  complete: function () {
    var self = this;

    // universal subs (sub_id is null) can't signal completion.  it's
    // not an error, since the same handler (eg publishQuery) might be
    // used to implement both named and universal subs.

    if (self.sub_id)
      self.pending_complete = true;
  },

  flush: function () {
    var self = this;
    var msg;

    for (var name in self.pending_updates)
      for (var id in self.pending_updates[name])
        self.socket.send(JSON.stringify(self.pending_updates[name][id]));

    if (self.pending_complete)
      self.socket.send(JSON.stringify({msg: 'data', subs: [self.sub_id]}));

    self.pending_updates = {};
    self.pending_complete = false;
  },

  _publishCursor: function (cursor, name) {
    var self = this;
    var collection = name || cursor.collection_name;

    var observe_handle = cursor.observe({
      added: function (obj) {
        self.set(collection, obj._id, obj);
        self.flush();
      },
      changed: function (obj, old_idx, old_obj) {
        var set = {};
        _.each(obj, function (v, k) {
          if (!_.isEqual(v, old_obj[k]))
            set[k] = v;
        });
        self.set(collection, obj._id, set);
        var dead_keys = _.difference(_.keys(old_obj), _.keys(obj));
        self.unset(collection, obj._id, dead_keys);
        self.flush();
      },
      removed: function (id, old_idx, old_obj) {
        self.unset(collection, id, _.keys(old_obj));
        self.flush();
      }
    });

    // observe only returns after the initial added callbacks have
    // run.  mark subscription as completed.
    self.complete();
    self.flush();

    // register stop callback (expects lambda w/ no args).
    self.onStop(_.bind(observe_handle.stop, observe_handle));
  }
});

/******************************************************************************/
/* LivedataServer                                                             */
/******************************************************************************/

Meteor._LivedataServer = function () {
  var self = this;

  self.publish_handlers = {};
  self.universal_publish_handlers = [];

  self.method_handlers = {};

  self.on_autopublish = []; // array of func if AP disabled, null if enabled
  self.warned_about_autopublish = false;

  self.sessions = {}; // map from id to session

  self.stream_server = new Meteor._StreamServer;

  self.stream_server.register(function (socket) {
    socket.meteor_session = new Meteor._LivedataSession(socket, self);

    socket.on('data', function (raw_msg) {
      try {
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

        if (msg.msg === 'connect')
          self._livedata_connect(socket, msg);
        else if (msg.msg === 'sub')
          self._livedata_sub(socket, msg);
        else if (msg.msg === 'unsub')
          self._livedata_unsub(socket, msg);
        else if (msg.msg === 'method')
          self._livedata_method(socket, msg);
        else
          Meteor._debug("discarding unknown livedata message type", msg);
      } catch (e) {
        // XXX print stack nicely
        Meteor._debug("Internal exception while processing message", msg,
                      e.stack);
      }
    });

    socket.on('close', function () {
      socket.meteor_session.stopAllSubscriptions();
    });
  });
};


_.extend(Meteor._LivedataServer.prototype, {
  // XXX 'connect' message should have a protocol version
  _livedata_connect: function (socket, msg) {
    var self = this;
    // Always start a new session. We don't support any reconnection.
    socket.send(JSON.stringify({msg: 'connected', session: Meteor.uuid()}));

    // Spin up all the universal publishers.
    Fiber(function () {
      _.each(self.universal_publish_handlers, function (handler) {
        socket.meteor_session.startSubscription(handler);
      });
    }).run();

    // XXX what to do here on reconnect?  oh, probably just fake a sub message.
  },

  _livedata_sub: function (socket, msg) {
    var self = this;

    // reject malformed messages
    if (typeof (msg.id) !== "string" ||
        typeof (msg.name) !== "string" ||
        (('params' in msg) && typeof (msg.params) !== "object")) {
      socket.send(JSON.stringify({
        msg: 'error', reason: 'Malformed subscription',
        offending_message: msg}));
      return;
    }

    if (!self.publish_handlers[msg.name]) {
      socket.send(JSON.stringify({
        msg: 'nosub', id: msg.id, error: {error: 404,
                                          reason: "Subscription not found"}}));
      return;
    }

    Fiber(function () {
      if (msg.id in socket.meteor_session.named_subs)
        // XXX client screwed up
        socket.meteor_session.stopSubscription(msg.id);

      var handler = self.publish_handlers[msg.name];
      socket.meteor_session.startSubscription(handler, msg.id, msg.params);
    }).run();
  },

  // XXX Fiber() doesn't interlock.  if a client subs then unsubs, the
  // subscription should end up as off.
  _livedata_unsub: function (socket, msg) {
    var self = this;

    Fiber(function () {
      socket.meteor_session.stopSubscription(msg.id);
    }).run();

    socket.send(JSON.stringify({msg: 'nosub', id: msg.id}));
  },

  _livedata_method: function (socket, msg) {
    var self = this;

    // reject malformed messages
    // XXX should also reject messages with unknown attributes?
    if (typeof (msg.id) !== "string" ||
        typeof (msg.method) !== "string" ||
        (('params' in msg) && !(msg.params instanceof Array))) {
      socket.send(JSON.stringify({
        msg: 'error', reason: 'Malformed method invocation',
        offending_message: msg}));
      if (typeof (msg.id) === "string")
        socket.send(JSON.stringify({
          msg: 'data', methods: [msg.id]}));
      return;
    }

    socket.meteor_session.enqueueMethod(msg);
  },

  /**
   * Register a publish handler function.
   *
   * @param name {String} identifier for query
   * @param handler {Function} publish handler
   * @param options {Object}
   *
   * Server will call handler function on each new subscription,
   * either when receiving DDP sub message for a named subscription, or on
   * DDP connect for a universal subscription.
   *
   * If name is null, this will be a subscription that is
   * automatically established and permanently on for all connected
   * client, instead of a subscription that can be turned on and off
   * with subscribe().
   *
   * options to contain:
   *  - (mostly internal) is_auto: true if generated automatically
   *    from an autopublish hook. this is for cosmetic purposes only
   *    (it lets us determine whether to print a warning suggesting
   *    that you turn off autopublish.)
   */
  publish: function (name, handler, options) {
    var self = this;

    options = options || {};

    if (name && name in self.publish_handlers) {
      Meteor._debug("Ignoring duplicate publish named '" + name + "'");
      return;
    }

    if (!self.on_autopublish && !options.is_auto) {
      // They have autopublish on, yet they're trying to manually
      // picking stuff to publish. They probably should turn off
      // autopublish. (This check isn't perfect -- if you create a
      // publish before you turn on autopublish, it won't catch
      // it. But this will definitely handle the simple case where
      // you've added the autopublish package to your app, and are
      // calling publish from your app code.)
      if (!self.warned_about_autopublish) {
        self.warned_about_autopublish = true;
        Meteor._debug(
"** You've set up some data subscriptions with Meteor.publish(), but\n" +
"** you still have autopublish turned on. Because autopublish is still\n" +
"** on, your Meteor.publish() calls won't have much effect. All data\n" +
"** will still be sent to all clients.\n" +
"**\n" +
"** Turn off autopublish by removing the autopublish package:\n" +
"**\n" +
"**   $ meteor remove autopublish\n" +
"**\n" +
"** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" +
"** for each collection that you want clients to see.\n");
      }
    }

    if (name)
      self.publish_handlers[name] = handler;
    else
      self.universal_publish_handlers.push(handler);
  },

  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self.method_handlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self.method_handlers[name] = func;
    });
  },

  call: function (name /*, arguments */) {
    return this.apply(name, Array.prototype.slice.call(arguments, 1));
  },

  apply: function (name, args) {
    var self = this;

    args = _.clone(args);
    var result_func;
    if (args.length && typeof args[args.length - 1] === "function") {
      result_func = Meteor.bindEnvironment(args.pop(), function (e) {
        // XXX improve error message (and how we report it)
        Meteor._debug("Exception while delivering result of invoking '" +
                      name + "'", e.stack);
      });
    }

    var handler = self.method_handlers[name];
    if (!handler) {
      if (result_func)
        result_func({error: 404, reason: "Method not found"});
      throw new Error("No such method '" + name + "'");
    }

    var invocation = new Meteor._ServerMethodInvocation(name, handler);
    return invocation._run(args, result_func);
  },

  // A much more elegant way to do this would be: let any autopublish
  // provider (eg, mongo-livedata) declare a weak package dependency
  // on the autopublish package, then have that package simply set a
  // flag that eg the Collection constructor checks, and autopublishes
  // if necessary.
  autopublish: function () {
    var self = this;
    _.each(self.on_autopublish || [], function (f) { f(); });
    self.on_autopublish = null;
  },

  onAutopublish: function (f) {
    var self = this;
    if (self.on_autopublish)
      self.on_autopublish.push(f);
    else
      f();
  },

  // called when we are up-to-date. intended for use only in tests.
  onQuiesce: function (f) {
    var self = this;
    // the server is always up-to-date
    f();
  },

});
