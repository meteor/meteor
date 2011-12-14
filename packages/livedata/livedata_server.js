if (typeof Sky === "undefined") Sky = {};

(function () {

  ////////// Internals //////////

  var publishes = {};
  var collections = {};

  var poll_subscriptions = function (socket) {
    Fiber(function () {
      // what we send to the client.
      // {collection_name:
      //   {inserted: [objects], updated: [objects], removed: [ids]}}
      var results = {};
      // set of keys we touched in the update. things in the cache that
      // are not touched are removed.
      var touched_keys = {};

      var add_to_results = function (collection, which, id) {
        if (!(collection in results))
          results[collection] = {};
        if (!(which in results[collection]))
          results[collection][which] = [];
        results[collection][which].push(id);
      };

      // setup a channel object
      var channel = {
        send: function(collection_name, obj) {
          if (!(obj instanceof Array))
            obj = [obj];
          if (obj.length === 0)
            return;

          _.each(obj, function (o) {
            if (!o._id) {
              console.log("WARNING trying to send object without _id"); // XXX
              return;
            }

            // | not allowed in collection name?
            var key = collection_name + "|" + o._id;

            var cached = socket.sky.cache[key];
            socket.sky.cache[key] = o;
            touched_keys[key] = true;

            if (!cached)
              add_to_results(collection_name, 'inserted', o);
            else if (JSON.stringify(o) !== JSON.stringify(cached))
              // Not canonical order comparison or anything, but close
              // enough I hope. We may send some spurious updates?
              add_to_results(collection_name, 'updated', o);
            else {
              // cache hit. do nothing.
            }
          });
        }
      };

      // actually run the subscriptions.
      _.each(socket.sky.subs, function (sub) {
        var pub = publishes[sub.name];
        if (!pub) {
          // XXX error unknown publish
          console.log("ERROR UNKNOWN PUBLISH " + sub.name);
          return;
        }

        pub(channel, sub.args);
      });

      // compute the removed keys.
      var removed_keys = _.difference(_.keys(socket.sky.cache),
                                      _.keys(touched_keys));
      _.each(removed_keys, function (key) {
        // XXX parsing from the string is so ugly.
        var parts = key.split("|");
        if (!parts || parts.length !== 2) return;
        var collection_name = parts[0];
        var id = parts[1];

        add_to_results(collection_name, 'removed', id);
        delete socket.sky.cache[key];
      });

      // if (and only if) any changes, send to client
      for (var x in results) {
        socket.emit('published', results);
        break;
      }

      // inform the client that the subscription is ready to go
      _.each(socket.sky.subs, function (sub) {
        if (!sub.ready) {
          socket.emit('subscription_ready', sub._id);
          sub.ready = true;
        }
      });

    }).run();
  };


  var register_subscription = function (socket, data) {
    socket.sky.subs.push(data);
    poll_subscriptions(socket);
  };

  var unregister_subscription = function (socket, data) {
    socket.sky.subs = _.filter(socket.sky.subs, function (x) {
      return x._id !== data._id;
    });
    poll_subscriptions(socket);
  };

  var run_handler = function (socket, data, other_sockets) {
    // XXX note that running this in a fiber means that two serial
    // requests from the client can try to execute in parallel.. we're
    // going to have to think that through at some point. also, consider
    // races against Sky.Collection(), though this shouldn't happen in
    // most normal use cases
    Fiber(function () {
      if (!('collection' in data) || !(data.collection in collections))
        // XXX gracefully report over the wire
        throw new Error("No such collection "+ JSON.stringify(data.collection));
      var collection = collections[data.collection];

      // XXX obviously, we're going to add validation and authentication
      // somewhere around here (and probably the ability to disable the
      // automatic mutators completely, too)
      if (data.type === 'insert')
        collection.insert(data.args);
      else if (data.type === 'update')
        collection.update(data.selector, data.mutator, data.options);
      else if (data.type === 'remove')
        collection.remove(data.selector);
      else if (data.type === 'method') {
        var func = collection._api[data.method];
        if (!func)
          throw new Error("No API method " + JSON.stringify(data.method) +
                          " on collection " + data.collection);
        func.apply(null, data.args);
      } else
        throw new Error("Bad handler type " + JSON.stringify(data.type));

      // XXX XXX should emit some kind of success/failure indication

      // after the handler, rerun all the subscriptions as stuff may have
      // changed.
      // XXX potential fast path for 'remove' -- we know which sockets
      // need the removal message; it's exactly the sockets that have
      // the item in their cache
      _.each(other_sockets, function(x) {
        if (x && x.sky) {
          x.sky.throttled_poll(); } });

    }).run();
  };

  Sky._stream.register(function (socket) {
    socket.sky = {};
    socket.sky.subs = [];
    socket.sky.cache = {};


    socket.on('subscribe', function (data) {
      register_subscription(socket, data);
    });

    socket.on('unsubscribe', function (data) {
      unregister_subscription(socket, data);
    });

    socket.on('handle', function (data) {
      run_handler(socket, data, Sky._stream.all_sockets());
    });

    // 5/sec updates tops, once every 10sec min.
    socket.sky.throttled_poll = _.throttle(function () {
      poll_subscriptions(socket)
    }, 50); // XXX only 50ms! for great speed. might want higher in prod.
    socket.sky.timer = setInterval(socket.sky.throttled_poll, 10000);
  });


  ////////// User visible API //////////

  _.extend(Sky, {
    is_server: true,
    is_client: false,

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
     *    Sky.subscribe and returns a mongodb selector. default {}
     */
    publish: function (name, options) {
      if (name in publishes) {
        // XXX error duplicate publish
        console.log("ERROR DUPLICATE PUBLISH " + name);
        return;
      }

      options = options || {};
      var collection = options.collection || collections[name];
      if (!collection)
        throw new Error("No collection '" + name + "' found to publish. " +
                        "You can specify the collection explicitly with the " +
                        "'collection' option.");
      var selector = options.selector || {};
      var func = function (channel, params) {
        var opt = function (key, or) {
          var x = options[key] || or;
          return (x instanceof Function) ? x(params) : x
        }
        channel.send(collection._name, collection.find(opt("selector", {}), {
          sort: opt("sort"),
          skip: opt("skip"),
          limit: opt("limit")
        }));
      };

      publishes[name] = func;
    },

    subscribe: function () {
      // ignored on server
    },

    autosubscribe: function () {
      // ignored on server
    }
  });

  Sky.Collection = function (name) {
    if (!name)
      // XXX maybe support this using minimongo?
      throw new Error("Anonymous collections aren't allowed on the server");

    var ret = {
      _name: name,
      _api: {},

      // XXX there are probably a lot of little places where this API
      // and minimongo diverge. we should track each of those down and
      // kill it.

      insert: function (doc) {
        // do id allocation here, so we never end up with an ObjectID.
        // This only happens if some calls this directly on the server,
        // since normally ids are allocated on the client and sent over
        // the wire to us.
        if (! doc._id) {
          // copy doc because we mess with it. only shallow copy.
          new_doc = {};
          _.extend(new_doc, doc);
          doc = new_doc;
          doc._id = Sky.uuid();
        }

        Sky._mongo_driver.insert(this._name, doc);

        // return the doc w/ _id, so we can use it.
        return doc;
      },

      find: function (selector, options) {
        return Sky._mongo_driver.find(this._name, selector, options);
      },

      findLive: function () {
        throw new Error("findLive isn't supported on the server");
      },

      update: function (selector, mod, options) {
        return Sky._mongo_driver.update(this._name, selector, mod, options);
      },

      remove: function (selector) {
        return Sky._mongo_driver.remove(this._name, selector);
      },

      schema: function () {
        // XXX not implemented yet
      },

      api: function (methods) {
        for (var method in methods) {
          this[method] = _.bind(methods[method], null);
          this._api[method] = methods[method];
        }
      }
    }

    if (name)
      collections[name] = ret;

    return ret;
  };

})();
