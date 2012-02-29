Meteor._ServerMethodInvocation = function (name, handler) {
  var self = this;

  self._enclosing = null;
  self.isSimulation = null;
  self._name = name;
  self._handler = handler;
  self._async = false;
  self._responded = false;
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

  _sendResponse: function (error, ret, from) {
    var self = this;
    if (!self._async && from === "async")
      throw new Error(
        "respond() and error() can only be called on async methods " +
          "(use beginAsync() to mark a method as async)");
    if (self._threw && from !== "throw")
      return;
    if (self._responded) {
      if (from === "throw")
        return;
      throw new Error(
        "respond() or error() may only be called once per request");
    }
    self._responded = true;
    if (!self._calledNext) {
      self._calledNext = true;
      self._next && self._next();
    }
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
      if (!self._async)
        self._sendResponse(undefined, ret, "sync");
      return ret;
    } catch (e) {
      // in async mode, _threw avoids races against other fibers that
      // might be trying to report a result
      self._threw = true;
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

Meteor._LivedataServer = function () {
  var self = this;

  self.publishes = {};
  self.universal_publishes = []; // publishes with no name
  self._hack_collections = {}; // XXX hack. name => Collection
  self.method_handlers = {};
  self.stream_server = new Meteor._StreamServer;
  self.on_autopublish = []; // array of func if AP disabled, null if enabled
  self.warned_about_autopublish = false;

  self.stream_server.register(function (socket) {
    socket.meteor = {};
    socket.meteor.subs = [];
    socket.meteor.cache = {};
    socket.meteor.pending_method_ids = [];
    socket.meteor.methods_blocked = false;
    socket.meteor.method_queue = [];

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


    // 5/sec updates tops, once every 10sec min.
    socket.meteor.throttled_poll = _.throttle(function () {
      self._poll_subscriptions(socket);
    }, 50); // XXX only 50ms! for great speed. might want higher in prod.
    socket.meteor.timer = setInterval(socket.meteor.throttled_poll, 10000);
  });
};

_.extend(Meteor._LivedataServer.prototype, {
  _poll_subscriptions: function (socket) {
    var self = this;

    Fiber(function () {
      // holds a clean copy of client's data.  channel.send will
      // populate new_cache, then we compute the difference with the old
      // cache, send the delta.
      var new_cache = {};

      // setup a channel object
      var channel = {
        // this gets called by publish lambda with each object.  send
        // populates the server's copy of what the client has.
        send: function(collection_name, obj) {
          if (!(obj instanceof Array))
            obj = [obj];

          _.each(obj, function (o) {
            if (!o._id) {
              console.log("WARNING trying to send object without _id"); // XXX
              return;
            }

            // XXX -- '|' not allowed in collection name?
            var key = collection_name + "|" + o._id;

            // insert or extend new_cache with 'o' object
            new_cache[key] = _.extend(new_cache[key] || {}, o);
          });
        }
      };

      // actually run the subscriptions.

      _.each(self.universal_publishes, function (pub) {
        pub(channel, {});
      });

      _.each(socket.meteor.subs, function (sub) {
        var pub = self.publishes[sub.name];
        if (!pub) {
          // XXX error unknown publish
          console.log("ERROR UNKNOWN PUBLISH " + sub.name);
          return;
        }

        pub(channel, sub.params);
      });


      // emit deltas for each item in the new cache (any object
      // created in this poll cycle).
      _.each(new_cache, function (new_obj, key) {
        var old_obj = socket.meteor.cache[key];

        // XXX parsing from the string is so ugly.
        var parts = key.split("|");
        if (!parts || parts.length !== 2) return;
        var collection_name = parts[0];
        var id = parts[1];

        var msg = {msg: 'data', collection: collection_name, id: id};

        if (!old_obj) {
          // New object. Send an insert down to the client.
          var obj_to_send = _.extend({}, new_obj);
          delete obj_to_send._id;
          if (_.keys(obj_to_send).length) {
            msg.set = obj_to_send;
            socket.send(JSON.stringify(msg));
          }

        } else {
          // Old object. Check for updates and send changes attributes
          // to the client.
          var set = {};
          var unset = [];

          _.each(new_obj, function (v, k) {
            // Not canonical order comparison or anything, but close
            // enough I hope. We may send some spurious updates?
            if (JSON.stringify(v) !== JSON.stringify(old_obj[k]))
              set[k] = v;
          });

          unset = _.difference(_.keys(old_obj), _.keys(new_obj));

          if (_.keys(set).length > 0)
            msg.set = set;
          if (unset.length > 0)
            msg.unset = unset;

          if (msg.set || msg.unset)
            socket.send(JSON.stringify(msg));
        }
      });

      // emit deltas for items in the old cache that no longer exist.
      var removed_keys = _.difference(_.keys(socket.meteor.cache),
                                      _.keys(new_cache));
      _.each(removed_keys, function (key) {
        // XXX parsing from the string is so ugly.
        var parts = key.split("|");
        if (!parts || parts.length !== 2) return;
        var collection_name = parts[0];
        var id = parts[1];

        var msg = {msg: 'data', collection: collection_name, id: id};
        msg.unset = _.without(_.keys(socket.meteor.cache[key]), '_id');
        socket.send(JSON.stringify(msg));
      });

      // promote new_cache to old_cache
      socket.meteor.cache = new_cache;

      // inform the client that the subscription is ready to go
      var subs_ready = [];
      _.each(socket.meteor.subs, function (sub) {
        if (!sub.ready) {
          subs_ready.push(sub._id);
          sub.ready = true;
        }
      });

      if (subs_ready.length || socket.meteor.pending_method_ids.length) {
        var msg = {msg: 'data'};
        if (subs_ready.length)
          msg.subs = subs_ready;
        if (socket.meteor.pending_method_ids.length)
          msg.methods = socket.meteor.pending_method_ids;
        socket.send(JSON.stringify(msg));
      }
      socket.meteor.pending_method_ids = [];

    }).run();
  },

  // XXX 'connect' message should have a protocol version
  _livedata_connect: function (socket, msg) {
    var self = this;
    // Always start a new session. We don't support any reconnection.
    socket.send(JSON.stringify({msg: 'connected', session: Meteor.uuid()}));
    // Run any universal publishes we may have.
    self._poll_subscriptions(socket);
  },

  _livedata_sub: function (socket, msg) {
    var self = this;

    // reject malformed messages
    if (typeof (msg.id) !== "string" ||
        typeof (msg.name) !== "string" ||
        (('params' in msg) && typeof (msg.params) !== "object")) {
      socket.send(JSON.stringify({
        msg: 'nosub', id: msg.id, error: {error: 400,
                                          reason: "Bad request"}}));
      return;
    }

    if (!self.publishes[msg.name]) {
      socket.send(JSON.stringify({
        msg: 'nosub', id: msg.id, error: {error: 404,
                                          reason: "Subscription not found"}}));
      return;
    }

    socket.meteor.subs.push({_id: msg.id, name: msg.name,
                             params: msg.params || {}});
    self._poll_subscriptions(socket);
  },

  _livedata_unsub: function (socket, msg) {
    var self = this;
    socket.send(JSON.stringify({msg: 'nosub', id: msg.id}));
    socket.meteor.subs = _.filter(socket.meteor.subs, function (x) {
      return x._id !== msg.id;
    });
    self._poll_subscriptions(socket);
  },

  _livedata_method: function (socket, msg) {
    var self = this;

    // reject malformed messages
    // XXX should also reject messages with unknown attributes?
    if (typeof (msg.id) !== "string" ||
        typeof (msg.method) !== "string" ||
        (('params' in msg) && !(msg.params instanceof Array))) {
      socket.send(JSON.stringify({
        msg: 'result', id: msg.id,
        error: {error: 400, reason: "Bad request"}}));
      if (typeof (msg.id) === "string")
        socket.send(JSON.stringify({
          msg: 'data', methods: [msg.id]}));
      return;
    }

    socket.meteor.method_queue.push(msg);
    self._try_invoke_next(socket);
  },

  _try_invoke_next: function (socket) {
    var self = this;

    // Invoke methods one at a time, in the order sent by the client
    // -- invocations sent by a given client block later invocations
    // sent by the same client, unless the method explicitly allows
    // later methods to run by calling beginAsync(true).

    if (socket.meteor.methods_blocked)
      return;
    var msg = socket.meteor.method_queue.shift();
    if (!msg)
      return;

    socket.meteor.methods_blocked = true;
    Fiber(function () {
      var next = function (error, ret) {
        socket.meteor.methods_blocked = false;
        _.defer(_.bind(self._try_invoke_next, self, socket));
      };

      var handler = self.method_handlers[msg.method];
      if (!handler) {
        socket.send(JSON.stringify({
          msg: 'result', id: msg.id,
          error: {error: 404, reason: "Method not found"}}));
        socket.send(JSON.stringify({
          msg: 'data', methods: [msg.id]}));
        next();
        return;
      }

      var callback = function (error, result) {
        if (error)
          socket.send(JSON.stringify({
            msg: 'result', id: msg.id, error: error}));
        else
          socket.send(JSON.stringify({
            msg: 'result', id: msg.id, result: result}));

        // after the method, rerun all the subscriptions as stuff may
        // have changed.
        // XXX going away in merge very soon
        socket.meteor.pending_method_ids.push(msg.id);
        _.each(self.stream_server.all_sockets(), function(x) {
          if (x && x.meteor)
            x.meteor.throttled_poll();
        });

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

  /**
   * Defines a live dataset that clients can subscribe to.
   *
   * @param name {String} identifier for query
   * @param options {Object}
   *
   * If name is null, this will be a subscription that is
   * automatically established and permanently on for all connected
   * client, instead of a subscription that can be turned on and off
   * with subscribe().
   *
   * options to contain:
   *  - collection {Collection} collection; defaults to the collection
   *    named 'name' on disk in mongodb
   *  - selector {Function<args> OR Object} either a mongodb selector,
   *    or a function that takes the argument object passed to
   *    Meteor.subscribe and returns a mongodb selector. default {}
   *  - (mostly internal) is_auto: true if generated automatically
   *    from an autopublish hook. this is for cosmetic purposes only
   *    (it lets us determine whether to print a warning suggesting
   *    that you turn off autopublish.)
   */
  publish: function (name, options) {
    var self = this;

    if (name && name in self.publishes) {
      // XXX error duplicate publish
      console.log("ERROR DUPLICATE PUBLISH " + name);
      return;
    }

    options = options || {};

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

    var collection = options.collection ||
      (name && self._hack_collections[name]);
    if (!collection) {
      if (name)
        throw new Error("No collection '" + name + "' found to publish. " +
                        "You can specify the collection explicitly with the " +
                        "'collection' option.");
      else
        throw new Error("When creating universal publishes, you must specify " +
                        "the collection explicitly with the 'collection' " +
                        "option.");
    }
    var selector = options.selector || {};
    var func = function (channel, params) {
      var opt = function (key, or) {
        var x = options[key] || or;
        return (x instanceof Function) ? x(params) : x;
      };

      channel.send(collection._name, collection.find(opt("selector", {}), {
        sort: opt("sort"),
        skip: opt("skip"),
        limit: opt("limit")
      }).fetch());
    };

    if (name)
      self.publishes[name] = func;
    else
      self.universal_publishes.push(func);
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
  }
});
