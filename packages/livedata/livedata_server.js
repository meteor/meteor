/******************************************************************************/
/* LivedataSession                                                            */
/******************************************************************************/

Meteor._LivedataSession = function (server) {
  var self = this;
  self.id = Meteor.uuid();

  self.server = server;

  self.initialized = false;
  self.socket = null;
  self.last_connect_time = 0;
  self.last_detach_time = +(new Date);

  self.in_queue = [];
  self.blocked = false;
  self.worker_running = false;

  self.out_queue = [];

  // id of invocation => {result or error, when}
  self.result_cache = {};

  // Sub objects for active subscriptions
  self.named_subs = {};
  self.universal_subs = [];

  self.next_sub_priority = 0;

  // map from collection name -> id -> key -> subscription id -> true
  self.provides_key = {};
};

_.extend(Meteor._LivedataSession.prototype, {
  // Connect a new socket to this session, displacing (and closing)
  // any socket that was previously connected
  connect: function (socket) {
    var self = this;
    if (self.socket) {
      self.socket.close();
      self.detach(self.socket);
    }

    self.socket = socket;
    self.last_connect_time = +(new Date);
    _.each(self.out_queue, function (msg) {
      self.socket.send(JSON.stringify(msg));
    });
    self.out_queue = [];

    // On initial connect, spin up all the universal publishers.
    if (!self.initialized) {
      self.initialized = true;
      Fiber(function () {
        _.each(self.server.universal_publish_handlers, function (handler) {
          self._startSubscription(handler, self.next_sub_priority--);
        });
      }).run();
    }
  },

  // If 'socket' is the socket currently connected to this session,
  // detach it (the session will then have no socket -- it will
  // continue running and queue up its messages.) If 'socket' isn't
  // the currently connected socket, just clean up the pointer that
  // may have led us to believe otherwise.
  detach: function (socket) {
    var self = this;
    if (socket === self.socket) {
      self.socket = null;
      self.last_detach_time = +(new Date);
    }
    if (socket.meteor_session === self)
      socket.meteor_session = null;
  },

  // Should be called periodically to prune the method invocation
  // replay cache.
  cleanup: function () {
    var self = this;
    // Only prune if we're connected, and we've been connected for at
    // least five minutes. That seems like enough time for the client
    // to finish its reconnection. Then, keep five minutes of
    // history. That seems like enough time for the client to receive
    // our responses, or else for us to notice that the connection is
    // gone.
    var now = +(new Date);
    if (!(self.socket && (now - self.last_connect_time) > 5 * 60 * 1000))
      return; // not connected, or not connected long enough

    var kill = [];
    _.each(self.result_cache, function (info, id) {
      if (now - info.when > 5 * 60 * 1000)
        kill.push(id);
    });
    _.each(kill, function (id) {
      delete self.result_cache[id];
    });
  },

  // Destroy this session. Stop all processing and tear everything
  // down. If a socket was attached, close it.
  destroy: function () {
    var self = this;
    if (self.socket) {
      self.socket.close();
      self.detach(self.socket);
    }
    self._stopAllSubscriptions();
    self.in_queue = self.out_queue = [];
  },

  // Send a message (queueing it if no socket is connected right now.)
  // It should be a JSON object (it will be stringified.)
  send: function (msg) {
    var self = this;
    if (self.socket)
      self.socket.send(JSON.stringify(msg));
    else
      self.out_queue.push(msg);
  },

  // Send a connection error.
  sendError: function (reason, offending_message) {
    var self = this;
    var msg = {msg: 'error', reason: reason};
    if (offending_message)
      msg.offending_message = offending_message;
    self.send(msg);
  },

  // Process 'msg' as an incoming message. (But as a guard against
  // race conditions during reconnection, ignore the message if
  // 'socket' is not the currently connected socket.)
  //
  // We run the messages from the client one at a time, in the order
  // given by the client. The message handler is passed an idempotent
  // function 'unblock' which it may call to allow other messages to
  // begin running in parallel in another fiber (for example, a method
  // that wants to yield.) Otherwise, it is automatically unblocked
  // when it returns.
  //
  // Actually, we don't have to 'totally order' the messages in this
  // way, but it's the easiest thing that's correct. (unsub needs to
  // be ordered against sub, methods need to be ordered against each
  // other.)
  processMessage: function (msg_in, socket) {
    var self = this;
    if (socket !== self.socket)
      return;

    self.in_queue.push(msg_in);
    if (self.worker_running)
      return;
    self.worker_running = true;

    var processNext = function () {
      var msg = self.in_queue.shift();
      if (!msg) {
        self.worker_running = false;
        return;
      }

      Fiber(function () {
        var blocked = true;

        var unblock = function () {
          if (!blocked)
            return; // idempotent
          blocked = false;
          processNext();
        };

        if (msg.msg in self.protocol_handlers)
          self.protocol_handlers[msg.msg].call(self, msg, unblock);
        else
          self.sendError('Bad request', msg);
        unblock(); // in case the handler didn't already do it
      }).run();
    };

    processNext();
  },

  protocol_handlers: {
    sub: function (msg) {
      var self = this;

      // reject malformed messages
      if (typeof (msg.id) !== "string" ||
          typeof (msg.name) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array))) {
        self.sendError("Malformed subscription", msg);
        return;
      }

      if (!self.server.publish_handlers[msg.name]) {
        self.send({
          msg: 'nosub', id: msg.id,
          error: {error: 404, reason: "Subscription not found"}});
        return;
      }

      if (msg.id in self.named_subs)
        // subs are idempotent, or rather, they are ignored if a sub
        // with that id already exists. this is important during
        // reconnect.
        return;

      var handler = self.server.publish_handlers[msg.name];
      self._startSubscription(handler, self.next_sub_priority--,
                              msg.id, msg.params);
    },

    unsub: function (msg) {
      var self = this;

      self._stopSubscription(msg.id);
      self.send({msg: 'nosub', id: msg.id});
    },

    method: function (msg, unblock) {
      var self = this;

      // reject malformed messages
      // XXX should also reject messages with unknown attributes?
      if (typeof (msg.id) !== "string" ||
          typeof (msg.method) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array))) {
        self.sendError("Malformed method invocation", msg);
        return;
      }

      // set up to mark the method as satisfied once all observers
      // (and subscriptions) have reacted to any writes that were
      // done.
      var fence = new Meteor._WriteFence;
      fence.onAllCommitted(function () {
        self.send({
          msg: 'data', methods: [msg.id]});
      });

      // check for a replayed method (this is important during
      // reconnect)
      if (msg.id in self.result_cache) {
        // found -- just resend whatever we sent last time
        var payload = _.clone(self.result_cache[msg.id]);
        delete payload.when;
        self.send(
          _.extend({msg: 'result', id: msg.id}, payload));
        fence.arm();
        return;
      }

      // find the handler
      var handler = self.server.method_handlers[msg.method];
      if (!handler) {
        self.send({
          msg: 'result', id: msg.id,
          error: {error: 404, reason: "Method not found"}});
        fence.arm();
        return;
      }

      var invocation = new Meteor._MethodInvocation(false /* is_simulation */,
                                                   unblock);
      try {
        var ret =
          Meteor._CurrentWriteFence.withValue(fence, function () {
            return Meteor._CurrentInvocation.withValue(invocation, function () {
              return handler.apply(invocation, msg.params || []);
            });
          });
      } catch (e) {
        var exception = e;
      }

      fence.arm(); // we're done adding writes to the fence
      unblock(); // unblock, if the method hasn't done it already

      // "blind" exceptions other than those that were deliberately
      // thrown to signal errors to the client
      if (exception && !(exception instanceof Meteor.Error)) {
        // tests can set the 'expected' flag on an exception so it
        // won't go to the server log
        if (!exception.expected)
          Meteor._debug("Exception while invoking method '" +
                        msg.method + "'", exception.stack);
        exception = new Meteor.Error(500, "Internal server error");
      }

      // send response and add to cache
      var payload =
        exception ? {error: exception} : (ret !== undefined ?
                                          {result: ret} : {});
      self.result_cache[msg.id] = _.extend({when: +(new Date)}, payload);
      self.send(_.extend({msg: 'result', id: msg.id}, payload));
    }
  },

  _startSubscription: function (handler, priority, sub_id, params) {
    var self = this;

    var sub = new Meteor._LivedataSubscription(self, sub_id, priority);
    if (sub_id)
      self.named_subs[sub_id] = sub;
    else
      self.universal_subs.push(sub);

    var res = handler.apply(sub, params || []);

    // if Meteor._RemoteCollectionDriver is available (defined in
    // mongo-livedata), automatically wire up handlers that return a
    // Cursor.  otherwise, the handler is completely responsible for
    // delivering its own data messages and registering stop
    // functions.
    //
    // XXX generalize
    if (Meteor._RemoteCollectionDriver && (res instanceof Meteor._Mongo.Cursor))
      sub._publishCursor(res);
  },

  // tear down specified subscription
  _stopSubscription: function (sub_id) {
    var self = this;

    if (sub_id && self.named_subs[sub_id]) {
      self.named_subs[sub_id].stop();
      delete self.named_subs[sub_id];
    }
  },

  // tear down all subscriptions
  _stopAllSubscriptions: function () {
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

  // return the current value for a particular key, as given by the
  // current contents of each subscription's snapshot.
  _effectiveValueForKey: function (collection_name, id, key) {
    var self = this;

    // Find all subs that publish a value for this key
    var provided_by = Meteor._get(self.provides_key, collection_name, id, key);
    provided_by = _.values(provided_by || {});

    if (provided_by.length === 0)
      return undefined; // no value for key

    // Which one is highest priority?
    var authority = _.max(provided_by, function (sub) {
      return sub.priority;
    });

    return authority.snapshot[collection_name][id][key];
  }
});

/******************************************************************************/
/* LivedataSubscription                                                       */
/******************************************************************************/

// ctor for a sub handle: the input to each publish function
Meteor._LivedataSubscription = function (session, sub_id, priority) {
  // LivedataSession
  this.session = session;

  // my subscription ID (generated by client, null for universal subs).
  this.sub_id = sub_id;

  // number (possibly negative.) when two subs return conflicting
  // values for the same key, the client will see the value from the
  // sub with the higher priority.
  this.priority = priority;

  // data queued up to be sent by the next flush()
  // map from collection name -> id -> key -> value
  // to indicate unset, value === undefined
  this.pending_data = {};
  this.pending_complete = false;

  // the current data for this subscription (as has been flush()ed to
  // the client.)
  // map from collection name -> id -> key -> value
  this.snapshot = {};
  this.sent_complete = false;

  // has stop() been called?
  this.stopped = false;

  // stop callbacks to g/c this sub.  called w/ zero arguments.
  this.stop_callbacks = [];
};

_.extend(Meteor._LivedataSubscription.prototype, {
  stop: function () {
    var self = this;

    if (self.stopped)
      return;

    // tell listeners, so they can clean up
    for (var i = 0; i < this.stop_callbacks.length; i++)
      (this.stop_callbacks[i])();

    // remove our data from the client (possibly unshadowing data from
    // lower priority subscriptions)
    self.pending_data = {};
    self.pending_complete = false;
    for (var name in self.snapshot) {
      self.pending_data[name] = {};
      for (var id in self.snapshot[name]) {
        self.pending_data[name][id] = {};
        for (var key in self.snapshot[name][id])
          self.pending_data[name][id][key] = undefined;
      }
    }
    self.flush();
    self.stopped = true;
  },

  onStop: function (callback) {
    this.stop_callbacks.push(callback);
  },

  set: function (collection_name, id, attributes) {
    var self = this;
    var obj = Meteor._ensure(self.pending_data, collection_name, id);
    _.each(attributes, function (value, key) {
      if (key !== '_id')
        obj[key] = value;
    });
  },

  unset: function (collection_name, id, keys) {
    var self = this;
    var obj = Meteor._ensure(self.pending_data, collection_name, id);
    _.each(keys, function (key) {
      if (key !== '_id')
        obj[key] = undefined; // do not delete - need to mark as 'to be unset'
    });
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

    if (self.stopped)
      return;

    for (var name in self.pending_data)
      for (var id in self.pending_data[name]) {
        var msg = {msg: 'data', collection: name, id: id};

        for (var key in self.pending_data[name][id]) {
          var value = self.pending_data[name][id][key];
          var snapshot = Meteor._ensure(self.snapshot, name, id);
          var old_value = snapshot[key];

          // Update our snapshot based on the written value. Update
          // our session's index too.
          if (value === undefined) {
            delete snapshot[key];
            Meteor._delete(self.session.provides_key, name, id, key);
          } else {
            snapshot[key] = value;
            var provides = Meteor._ensure(self.session.provides_key,
                                          name, id, key);
            provides[self.sub_id] = self;
          }

          // Now, find the actual value that the client should get,
          // after taking into account any higher-priority
          // subscriptions.
          value = self.session._effectiveValueForKey(name, id, key);

          // And add to the packet that we're sending to the client.
          if (value !== old_value) {
            if (value === undefined) {
              if (!('unset' in msg))
                msg.unset = [];
              msg.unset.push(key);
            } else {
              if (!('set' in msg))
                msg.set = {};
              msg.set[key] = value;
            }
          }
        }

        // Send an update for one object.
        if ('set' in msg || 'unset' in msg)
          self.session.send(msg);
      }

    if (self.pending_complete && !self.sent_complete) {
      self.session.send({msg: 'data', subs: [self.sub_id]});
      self.sent_complete = true;
    }

    self.pending_data = {};
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
      removed: function (old_obj, old_idx) {
        self.unset(collection, old_obj._id, _.keys(old_obj));
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
    socket.meteor_session = null;

    var sendError = function (reason, offending_message) {
      var msg = {msg: 'error', reason: reason};
      if (offending_message)
        msg.offending_message = offending_message;
      socket.send(JSON.stringify(msg));
    };

    socket.on('data', function (raw_msg) {
      try {
        try {
          var msg = JSON.parse(raw_msg);
        } catch (err) {
          sendError('Parse error');
          return;
        }
        if (typeof msg !== 'object' || !msg.msg) {
          sendError('Bad request', msg);
          return;
        }

        if (msg.msg === 'connect') {
          if (socket.meteor_session) {
            sendError("Already connected", msg);
            return;
          }

          // XXX session resumption does not work yet!
          // https://app.asana.com/0/159908330244/577350817064
          // disabled here:
          /*
          if (msg.session)
            var old_session = self.sessions[msg.session];
          if (old_session) {
            // Resuming a session
            socket.meteor_session = old_session;
          }
          else */ {
            // Creating a new session
            socket.meteor_session = new Meteor._LivedataSession(self);
            self.sessions[socket.meteor_session.id] = socket.meteor_session;
          }

          socket.send(JSON.stringify({msg: 'connected',
                                      session: socket.meteor_session.id}));
          // will kick off previous connection, if any
          socket.meteor_session.connect(socket);
          return;
        }

        if (!socket.meteor_session) {
          sendError('Must connect first', msg);
          return;
        }
        socket.meteor_session.processMessage(msg, socket);
      } catch (e) {
        // XXX print stack nicely
        Meteor._debug("Internal exception while processing message", msg,
                      e.stack);
      }
    });

    socket.on('close', function () {
      if (socket.meteor_session)
        socket.meteor_session.detach(socket);
    });
  });

  // Every minute, clean up sessions that have been abandoned for 15
  // minutes. Also run result cache cleanup.
  // XXX at scale, we'll want to have a separate timer for each
  // session, and stagger them
  setInterval(function () {
    var now = +(new Date);
    _.each(self.sessions, function (s) {
      s.cleanup();
      if (!s.socket && (now - s.last_detach_time) > 15 * 60 * 1000)
        s.destroy();
    });
  }, 1 * 60 * 1000);
};

_.extend(Meteor._LivedataServer.prototype, {
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
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();
    return this.apply(name, args, callback);
  },

  apply: function (name, args, callback) {
    var self = this;

    if (callback)
      // It's not really necessary to do this, since we immediately
      // run the callback in this fiber before returning, but we do it
      // anyway for regularity.
      callback = Meteor.bindEnvironment(callback, function (e) {
        // XXX improve error message (and how we report it)
        Meteor._debug("Exception while delivering result of invoking '" +
                      name + "'", e.stack);
      });

    // Run the handler
    var handler = self.method_handlers[name];
    if (!handler)
      var exception = new Meteor.Error(404, "Method not found");
    else {
      var invocation = new Meteor._MethodInvocation(false /* is_simulation */);
      try {
        var ret = Meteor._CurrentInvocation.withValue(invocation, function () {
          return handler.apply(invocation, args);
        });
      } catch (e) {
        var exception = e;
      }
    }

    // Return the result in whichever way the caller asked for it
    if (callback) {
      callback(exception, ret);
      return;
    }
    if (exception)
      throw exception;
    return ret;
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
