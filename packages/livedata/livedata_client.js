Sky = window.Sky || {};

// XXX right now, if we can't connect to the database, we silently
// drop writes on the floor!! that is very, very lame.

(function () {
  var socket = io.connect();
  var collections = {}; // name -> Collection-type object

  var subs = new Collection();
  // keyed by subs._id. value is unset or an array. if set, sub is not
  // yet ready.
  var sub_ready_callbacks = {};
  // list of subscription tokens outstanding during a
  // captureDependencies run. only set when we're doing a run. The fact
  // that this is a singleton means we can't do recursive
  // Sky.subscriptions(). But who wants that? What does that even mean?
  var capture_subs;

  socket.on('connect', function () {
    // XXX
  });
  socket.on('disconnect', function () {
    // XXX reconnect
  });

  socket.on('published', function (data) {
    _.each(data, function (changes, collection_name) {
      var coll = collections[collection_name];
      if (!coll) {
        console.log("discarding data received for unknown collection " +
                    JSON.stringify(collection_name));
        return;
      }

      // XXX this is all a little whack. Need to think about how we handle
      // removes, etc.
      (changes.inserted || []).forEach(function (elt) {
        if (!coll.find(elt._id)) {
          coll._collection.insert(elt);
        } else {
          // we already added it locally! this is the case after an insert
          // handler.
          coll._collection.update({_id: elt._id}, elt);
        }
      });
      (changes.updated || []).forEach(function (elt) {
        coll._collection.update({_id: elt._id}, elt);
      });
      (changes.removed || []).forEach(function (id) {
        coll._collection.remove({_id: id});
      });
    });
  });

  socket.on('subscription_ready', function (id) {
    var arr = sub_ready_callbacks[id];
    if (arr) _.each(arr, function (c) { c(); });
    delete sub_ready_callbacks[id];
  });

  var subsToken = subs.findLive({}, {
    added: function (sub) {
      socket.emit('subscribe', {
        _id: sub._id, name: sub.name, args: sub.args});
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { subs.remove({_id: sub._id}); });
      }
    },
    removed: function (id) {
      socket.emit('unsubscribe', {_id: id});
    }
  });

  // XXX let it take a second argument, the URL of the domain that
  // hosts the collection :)
  Sky.Collection = function (name) {
    if (name && (name in collections))
      // maybe should just return collections[name]?
      throw new Error("There is already a remote collection '" + name + "'");

    var ret = {
      _name: name,
      _collection: new Collection(),

      insert: function (obj) {
        // Generate an id for the object.
        // XXX mutates the object passed in. that is not cool.
        if (obj._id)
          console.log("WARNING: trying to insert object w/ _id set");
        var _id = Sky.genId();
        obj._id = _id;

        if (this._name)
          socket.emit('handle', {collection: this._name, type: 'insert',
                                 args: obj});
        this._collection.insert(obj);

        return obj;
      },

      find: function (selector, options) {
        return this._collection.find(selector, options);
      },

      findLive: function (selector, options) {
        return this._collection.findLive(selector, options);
      },

      update: function (selector, mutator, options) {
        if (typeof(selector) === "string")
          selector = {_id: selector};

        if (this._name)
          socket.emit('handle', {collection: this._name, type: 'update',
                                 selector: selector, mutator: mutator,
                                 options: options});
        this._collection.update(selector, mutator, options);
      },

      remove: function (selector) {
        if (typeof(selector) === "string")
          selector = {_id: selector};

        if (this._name)
          socket.emit('handle', {collection: this._name, type: 'remove',
                                 selector: selector});
        this._collection.remove(selector);
      },

      schema: function  () {
        // XXX not implemented yet
      },

      api: function (methods) {
        _.each(methods, function (func, method) {
          this[method] = function (/* arguments */) {
            // (must turn 'arguments' into a plain array so as not to
            // confuse stringify)
            var args = [].slice.call(arguments);

            // run the handler ourselves
            methods[method].apply(null, args);

            // tell the server to run the handler
            if (this._name)
              socket.emit('handle', {collection: this._name, type: 'method',
                                     method: method, args: args});
          };
        }, this);
      }
    };
    // XXX XXX turn on captureDependencies in minimongo.
    // should be a better way to do this.
    ret._collection.depsFunc = Sky.deps.getInvalidationFunction;


    if (name)
      collections[name] = ret;

    return ret;
  };

  _.extend(Sky, {
    // XXX don't get this out of minimongo..
    genId: Collection._genId,

    is_server: false,
    is_client: true,

    publish: function() {
      // ignored on the client
    },

    subscribe: function (name, args, callback) {
      var id;
      var existing = subs.find({name: name, args: args});

      if (existing && existing[0]) {
        // already subbed, inc count.
        id = existing[0]._id;
        subs.update({_id: id}, {$inc: {count: 1}});

        if (callback) {
          if (sub_ready_callbacks[id])
            sub_ready_callbacks[id].push(callback);
          else
            callback(); // XXX maybe _.defer?
        }
      } else {
        // new sub, add object.
        // generate our own id so we can know it w/ a find afterwards.
        id = Sky.genId();
        subs.insert({_id: id, name: name, args: args, count: 1});

        sub_ready_callbacks[id] = [];

        if (callback)
          sub_ready_callbacks[id].push(callback);
      }

      // return an object with a stop method.
      var token = {stop: function () {
        if (!id) return; // must have an id (local from above).
        // just update the database. findLive takes care of the rest.
        subs.update({_id: id}, {$inc: {count: -1}});
      }};

      if (capture_subs) capture_subs.push(token);

      return token;
    },

    subscriptions: function (sub_func) {
      var local_subs = [];

      Sky.deps.captureDependencies(function () {
        if (capture_subs)
          throw new Error("Sky.subscriptions may not be called recursively");

        capture_subs = [];
        sub_func();
        local_subs = capture_subs;
        capture_subs = undefined;


      }, function (key, new_value, old_value) {
        // recurse.
        Sky.subscriptions(sub_func);
        // unsub after re-subbing, to avoid bouncing.
        _.each(local_subs, function (x) { x.stop() });
      });
    },

    startup: function (callback) {
      // defer so that we don't kill what is running when startup is
      // called. this way things don't break, but we still get an error
      // on the console.
      _.defer(function () {
        throw new Error("Sky.startup not supported on the client. Use jQuery.ready() or an equivalent method.");
      });
    }

  });
})();
