if (typeof Meteor === "undefined") Meteor = {};

Meteor._LivedataServer = function () {
  var self = this;

  self.publishes = {};
  self.collections = {};
  self.method_handlers = {};
  self.stream_server = new Meteor._StreamServer;

  self.stream_server.register(function (socket) {
    socket.meteor = {};
    socket.meteor.subs = [];
    socket.meteor.cache = {};
    socket.meteor.pending_method_ids = [];

    socket.on('livedata', function (msg) {
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
    });


    // 5/sec updates tops, once every 10sec min.
    socket.meteor.throttled_poll = _.throttle(function () {
      self._poll_subscriptions(socket)
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

            // | not allowed in collection name?
            var key = collection_name + "|" + o._id;

            // insert or extend new_cache with 'o' object
            new_cache[key] = _.extend(new_cache[key] || {}, o);
          });
        }
      };

      // actually run the subscriptions.
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
          var obj_to_send = _.extend({}, new_obj);
          delete obj_to_send._id;
          msg.set = obj_to_send;
          socket.emit('livedata', msg);

        } else {
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

          socket.emit('livedata', msg);
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
        socket.emit('livedata', msg);
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
        socket.emit('livedata', msg);
      }
      socket.meteor.pending_method_ids = [];

    }).run();
  },

  _livedata_connect: function (socket, msg) {
    var self = this;
    // Always start a new session. We don't support any reconnection.
    socket.emit('livedata', {msg: 'connected', session: Meteor.uuid()});
  },

  _livedata_sub: function (socket, msg) {
    var self = this;

    if (!self.publishes[msg.name]) {
      // can't sub to unknown publish name
      // XXX error value
      socket.emit('livedata', {
        msg: 'nosub', id: msg.id, error: {error: 17, reason: "Unknown name"}});
      return;
    }

    socket.meteor.subs.push({_id: msg.id, name: msg.name, params: msg.params});
    self._poll_subscriptions(socket);
  },

  _livedata_unsub: function (socket, msg) {
    var self = this;
    socket.emit('livedata', {msg: 'nosub', id: msg.id});
    socket.meteor.subs = _.filter(socket.meteor.subs, function (x) {
      return x._id !== msg.id;
    });
    self._poll_subscriptions(socket);
  },

  _livedata_method: function (socket, msg) {
    var self = this;
    // XXX note that running this in a fiber means that two serial
    // requests from the client can try to execute in parallel.. we're
    // going to have to think that through at some point. also, consider
    // races against Meteor.Collection(), though this shouldn't happen in
    // most normal use cases
    Fiber(function () {
      var func = msg.method && self.method_handlers[msg.method];
      if (!func) {
        socket.emit('livedata', {
          msg: 'result', id: msg.id,
          error: {error: 12, /* XXX error codes! */
                  reason: "Method not found"}});
        return;
      }

      try {
        var result = func.apply(null, msg.params);
        socket.emit('livedata', {
          msg: 'result', id: msg.id, result: result});
      } catch (err) {
        socket.emit('livedata', {
          msg: 'result', id: msg.id,
          error: {error: 13, /* XXX error codes! */
                  reason: "Internal server error"}});
        // XXX prettyprint exception in the log
        Meteor._debug("Exception in method '" + msg.method + "': " +
                      JSON.stringify(err));
      }

      if (msg.id)
        socket.meteor.pending_method_ids.push(msg.id);

      // after the method, rerun all the subscriptions as stuff may have
      // changed.
      _.each(self.stream_server.all_sockets(), function(x) {
        if (x && x.meteor)
          x.meteor.throttled_poll();
      });

    }).run();
  },

  /**
   * Defines a live dataset that clients can subscribe to.
   *
   * @param name {String} identifier for query
   * @param options {Object}
   *
   * options to contain:
   *  - collection {Collection} collection; defaults to the collection
   *    named 'name' on disk in mongodb
   *  - selector {Function<args> OR Object} either a mongodb selector,
   *    or a function that takes the argument object passed to
   *    Meteor.subscribe and returns a mongodb selector. default {}
   */
  publish: function (name, options) {
    var self = this;

    if (name in self.publishes) {
      // XXX error duplicate publish
      console.log("ERROR DUPLICATE PUBLISH " + name);
      return;
    }

    options = options || {};
    var collection = options.collection || self.collections[name];
    if (!collection)
      throw new Error("No collection '" + name + "' found to publish. " +
                      "You can specify the collection explicitly with the " +
                      "'collection' option.");
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

    self.publishes[name] = func;
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
    var handler = self.method_handlers[name];
    if (!handler)
      throw new Error("No such method '" + name + "'");

    args = _.clone(args);
    if (args.length && typeof args[args.length - 1] === "function")
      var result_func = args.pop();
    else
      var result_func = function () {};

    /*
       var user_id =
       (Fiber.current && Fiber.current._meteor_livedata_user_id) || null;
      args.unshift(user_id);
    */
    var ret = handler.apply(null, args);
    if (result_func)
      result_func(ret); // XXX catch exception?
    return ret;
  }
});

Meteor._Collection = function (name, server) {
  var self = this;

  if (!name)
    // XXX maybe support this using minimongo?
    throw new Error("Anonymous collections aren't allowed on the server");

  self._name = name;
  self._api = {};
  self._server = server;

  if (name) {
    self._server.collections[name] = self;
    // XXX temporary automatically generated methods for mongo mutators
    self._server.method_handlers['/' + name + '/insert'] = function (obj) {
      self.insert(obj);
    };
    self._server.method_handlers['/' + name + '/update'] = function (selector, mutator, options) {
      self.update(selector, mutator, options);
    };
    self._server.method_handlers['/' + name + '/remove'] = function (selector) {
      self.remove(selector);
    };
  }
};

_.extend(Meteor._Collection.prototype, {
  // XXX there are probably a lot of little places where this API
  // and minimongo diverge. we should track each of those down and
  // kill it.

  find: function (selector, options) {
    var self = this;

    if (arguments.length === 0)
      selector = {};

    return new Meteor._mongo_driver.Cursor(self._name, selector, options);
  },

  findOne: function (selector, options) {
    var self = this;

    if (arguments.length === 0)
      selector = {};

    // XXX when implementing observe() on the server, either
    // support limit or remove this performance hack.
    options = options || {};
    options.limit = 1;
    return self.find(selector, options).fetch()[0];
  },

  insert: function (doc) {
    var self = this;

    // do id allocation here, so we never end up with an ObjectID.
    // This only happens if some calls this directly on the server,
    // since normally ids are allocated on the client and sent over
    // the wire to us.
    if (! doc._id) {
      // copy doc because we mess with it. only shallow copy.
      new_doc = {};
      _.extend(new_doc, doc);
      doc = new_doc;
      doc._id = Meteor.uuid();
    }

    Meteor._mongo_driver.insert(self._name, doc);

    // return the doc w/ _id, so we can use it.
    return doc;
  },

  update: function (selector, mod, options) {
    var self = this;
    return Meteor._mongo_driver.update(self._name, selector, mod, options);
  },

  remove: function (selector) {
    var self = this;

    if (arguments.length === 0)
      selector = {};

    return Meteor._mongo_driver.remove(self._name, selector);
  },

  schema: function () {
    // XXX not implemented yet
  }
});

// XXX temporary -- rename
TheServer = new Meteor._LivedataServer;

_.extend(Meteor, {
  is_server: true,
  is_client: false,

  publish: _.bind(TheServer.publish, TheServer),

  // XXX eliminate shim; have app do it directly
  Collection: function (name) {
    return new Meteor._Collection(name, TheServer);
  },

  // these are ignored on the server
  subscribe: function () {},
  autosubscribe: function () {}
});
