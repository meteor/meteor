if (typeof Meteor === "undefined") Meteor = {};

(function () {
  var collections = {}; // name -> Collection-type object

  var subs = new Collection();
  // keyed by subs._id. value is unset or an array. if set, sub is not
  // yet ready.
  var sub_ready_callbacks = {};
  // list of subscription tokens outstanding during a
  // captureDependencies run. only set when we're doing a run. The fact
  // that this is a singleton means we can't do recursive
  // Meteor.subscriptions(). But who wants that? What does that even mean?
  var capture_subs;

  Meteor._stream.on('published', function (data) {
    _.each(data, function (changes, collection_name) {
      var coll = collections[collection_name];
      if (!coll) {
        Meteor._debug(
          "discarding data received for unknown collection " +
            JSON.stringify(collection_name));
        return;
      }

      // XXX this is all a little whack. Need to think about how we handle
      // removes, etc.
      _.each(changes.inserted || [], function (elt) {
        if (!coll.findOne(elt._id)) {
          coll._collection.insert(elt);
        } else {
          // we already added it locally! this is the case after an insert
          // handler.
          coll._collection.update({_id: elt._id}, elt);
        }
      });
      _.each(changes.updated || [], function (elt) {
        coll._collection.update({_id: elt._id}, elt);
      });
      _.each(changes.removed || [], function (id) {
        coll._collection.remove({_id: id});
      });
    });
  });

  Meteor._stream.on('subscription_ready', function (id) {
    var arr = sub_ready_callbacks[id];
    if (arr) _.each(arr, function (c) { c(); });
    delete sub_ready_callbacks[id];
  });


  Meteor._stream.reset(function (msg_list) {
    // remove existing subscribe and unsubscribe
    msg_list = _.reject(msg_list, function (elem) {
      return (!elem || elem[0] === "subscribe" || elem[0] === "unsubscribe");
    });

    // add new subscriptions at the end. this way they take effect after
    // the handlers and we don't see flicker.
    subs.find().forEach(function (sub) {
      msg_list.push(
        ['subscribe', {
          _id: sub._id, name: sub.name, args: sub.args}]);
    });

    // clear out the local database!
    _.each(collections, function (col) {
      col._collection.remove({});
    });

    return msg_list;
  });


  var subsToken = subs.find({}).observe({
    added: function (sub) {
      Meteor._stream.emit('subscribe', {
        _id: sub._id, name: sub.name, args: sub.args});
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { subs.remove({_id: sub._id}); });
      }
    },
    removed: function (id) {
      Meteor._stream.emit('unsubscribe', {_id: id});
    }
  });

  // XXX let it take a second argument, the URL of the domain that
  // hosts the collection :)
  Meteor.Collection = function (name) {
    if (name && (name in collections))
      // maybe should just return collections[name]?
      throw new Error("There is already a remote collection '" + name + "'");

    var ret = {
      _name: name,
      _collection: new Collection(),

      find: function (selector, options) {
        return this._collection.find(selector, options);
      },

      findOne: function (selector) {
        return this._collection.findOne(selector);
      },

      insert: function (obj) {
        // Generate an id for the object.
        // XXX mutates the object passed in. that is not cool.
        if (obj._id)
          Meteor._debug("WARNING: trying to insert object w/ _id set");
        var _id = Collection.uuid();
        obj._id = _id;

        if (this._name)
          Meteor._stream.emit('handle', {
            collection: this._name, type: 'insert', args: obj});
        this._collection.insert(obj);

        return obj;
      },

      update: function (selector, mutator, options) {
        if (typeof(selector) === "string")
          selector = {_id: selector};

        if (this._name)
          Meteor._stream.emit('handle', {
            collection: this._name, type: 'update',
            selector: selector, mutator: mutator, options: options});
        this._collection.update(selector, mutator, options);
      },

      remove: function (selector) {
        if (typeof(selector) === "string")
          selector = {_id: selector};

        if (this._name)
          Meteor._stream.emit('handle', {
            collection: this._name, type: 'remove', selector: selector});
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
              Meteor._stream.emit('handle', {
                collection: this._name, type: 'method',
                method: method, args: args});
          };
        }, this);
      }
    };

    if (name)
      collections[name] = ret;

    return ret;
  };

  _.extend(Meteor, {
    is_server: false,
    is_client: true,

    publish: function() {
      // ignored on the client
    },

    subscribe: function (name, args, callback) {
      var id;
      var existing = subs.find({name: name, args: args}, {reactive: false}).fetch();

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
        id = Collection.uuid();
        subs.insert({_id: id, name: name, args: args, count: 1});

        sub_ready_callbacks[id] = [];

        if (callback)
          sub_ready_callbacks[id].push(callback);
      }

      // return an object with a stop method.
      var token = {stop: function () {
        if (!id) return; // must have an id (local from above).
        // just update the database. observe takes care of the rest.
        subs.update({_id: id}, {$inc: {count: -1}});
      }};

      if (capture_subs) capture_subs.push(token);

      return token;
    },

    autosubscribe: function (sub_func) {
      var local_subs = [];
      var context = new Meteor.deps.Context();

      context.on_invalidate(function () {
        // recurse.
        Meteor.autosubscribe(sub_func);
        // unsub after re-subbing, to avoid bouncing.
        _.each(local_subs, function (x) { x.stop() });
      });

      context.run(function () {
        if (capture_subs)
          throw new Error("Meteor.autosubscribe may not be called recursively");

        capture_subs = [];
        try {
          sub_func();
        } finally {
          local_subs = capture_subs;
          capture_subs = undefined;
        }
      });
    }
  });
})();
