if (typeof Meteor === "undefined") Meteor = {};

Meteor._LivedataServer = function () {
  var self = this;

  self.publishes = {};
  self._hack_collections = {}; // XXX hack. name => Collection
  self.method_handlers = {};
  self.stream_server = new Meteor._StreamServer;

  self.stream_server.register(function (socket) {
    socket.meteor = {};
    socket.meteor.subs = [];
    socket.meteor.cache = {};
    socket.meteor.pending_method_ids = [];

    socket.on('data', function (raw_msg) {
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

  _livedata_connect: function (socket, msg) {
    var self = this;
    // Always start a new session. We don't support any reconnection.
    socket.send(JSON.stringify({msg: 'connected', session: Meteor.uuid()}));
  },

  _livedata_sub: function (socket, msg) {
    var self = this;


    if (!self.publishes[msg.name]) {
      // can't sub to unknown publish name
      // XXX error value
      socket.send(JSON.stringify({
        msg: 'nosub', id: msg.id, error: {error: 17, reason: "Unknown name"}}));
      return;
    }

    socket.meteor.subs.push({_id: msg.id, name: msg.name, params: msg.params});
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
    // XXX note that running this in a fiber means that two serial
    // requests from the client can try to execute in parallel.. we're
    // going to have to think that through at some point. also, consider
    // races against Meteor.Collection(), though this shouldn't happen in
    // most normal use cases
    Fiber(function () {
      var func = msg.method && self.method_handlers[msg.method];
      if (!func) {
        socket.send(JSON.stringify({
          msg: 'result', id: msg.id,
          error: {error: 12, /* XXX error codes! */
                  reason: "Method not found"}}));
        return;
      }

      try {
        var result = func.apply(null, msg.params);
        socket.send(JSON.stringify({
          msg: 'result', id: msg.id, result: result}));
      } catch (err) {
        socket.send(JSON.stringify({
          msg: 'result', id: msg.id,
          error: {error: 13, /* XXX error codes! */
                  reason: "Internal server error"}}));
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
    var collection = options.collection || self._hack_collections[name];
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


App = new Meteor._LivedataServer;

// XXX need to restructure so that both client and server have methods
// like Meteor.connect and Meteor.autosubscribe

_.extend(Meteor, {
  publish: _.bind(App.publish, App),

  // these are ignored on the server
  subscribe: function () {},
  autosubscribe: function () {}
});
