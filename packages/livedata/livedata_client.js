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

  // all socket.io traffic is framed as a "livedata" message.
  Meteor._stream.on('livedata', function (msg) {
    if (typeof(msg) !== 'object' || !msg.msg) {
      Meteor._debug("discarding invalid livedata message", msg);
      return;
    }

    if (msg.msg === 'connected')
      livedata_connected(msg);
    else if (msg.msg === 'data')
      livedata_data(msg);
    else if (msg.msg === 'nosub')
      livedata_nosub(msg);
    else if (msg.msg === 'result')
      livedata_result(msg);
    else
      Meteor._debug("discarding unknown livedata message type", msg);
  });

  var livedata_connected = function (msg) {
    // Meteor._debug("CONNECTED", msg);
  };

  var livedata_data = function (msg) {
    if (msg.collection && msg.id) {
      var meteor_coll = collections[msg.collection];

      if (!meteor_coll) {
        Meteor._debug(
          "discarding data received for unknown collection " +
            JSON.stringify(msg.collection));
        return;
      }

      // do all the work against underlying minimongo collection.
      var coll = meteor_coll._collection;

      var doc = coll.findOne(msg.id);

      if (doc
          && (!msg.set || msg.set.length === 0)
          && _.difference(_.keys(doc), msg.unset, ['_id']).length === 0) {
        // what's left is empty, just remove it.  cannot fail.
        coll.remove(msg.id);
      } else if (doc) {
        var mutator = {$set: msg.set, $unset: {}};
        _.each(msg.unset, function (propname) {
          mutator.$unset[propname] = 1;
        });
        // XXX error check return value from update.
        coll.update(msg.id, mutator);
      } else {
        // XXX error check return value from insert.
        coll.insert(_.extend({_id: msg.id}, msg.set));
      }
    }

    if (msg.subs) {
      _.each(msg.subs, function (id) {
        var arr = sub_ready_callbacks[id];
        if (arr) _.each(arr, function (c) { c(); });
        delete sub_ready_callbacks[id];
      });
    }
    if (msg.methods) {
      // Meteor._debug("METHODCOMPLETE", msg.methods);
    }
  };

  var livedata_nosub = function (msg) {
    // Meteor._debug("NOSUB", msg);
  };

  var livedata_result = function (msg) {
    // Meteor._debug("RESULT", msg);
  };

  Meteor._stream.reset(function (msg_list) {
    // remove all 'livedata' message except 'method'
    msg_list = _.filter(msg_list, function (elem) {
      return (elem && (elem[0] !== "livedata" ||
                       (elem[1] && elem[1].msg === "method")));
    });

    // Send a connect message at the beginning of the stream.
    // NOTE: reset is called even on the first connection, so this is
    // the only place we send this message.
    msg_list.unshift(['livedata', {msg: 'connect'}]);

    // add new subscriptions at the end. this way they take effect after
    // the handlers and we don't see flicker.
    subs.find().forEach(function (sub) {
      msg_list.push(
        ['livedata',
         {msg: 'sub', id: sub._id, name: sub.name, params: sub.args}]);
    });

    // clear out the local database!
    _.each(collections, function (col) {
      col._collection.remove({});
    });

    return msg_list;
  });

  var subsToken = subs.find({}).observe({
    added: function (sub) {
      Meteor._stream.emit('livedata', {
        msg: 'sub', id: sub._id, name: sub.name, params: sub.args});
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { subs.remove({_id: sub._id}); });
      }
    },
    removed: function (id) {
      Meteor._stream.emit('livedata', {msg: 'unsub', id: id});
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

      find: function (/* selector, options */) {
        // Collection.find() (return all docs) behaves differently
        // from Collection.find(undefined) (return 0 docs).  so be
        // careful about preserving the length of arguments when
        // descending into minimongo.
        return this._collection.find.apply(this._collection, Array.prototype.slice.call(arguments));
      },

      findOne: function (/* selector, options */) {
        // as above
        return this._collection.findOne.apply(this._collection, Array.prototype.slice.call(arguments));
      },

      insert: function (obj) {
        // Generate an id for the object.
        // XXX mutates the object passed in. that is not cool.
        if (obj._id)
          Meteor._debug("WARNING: trying to insert object w/ _id set");
        var _id = Collection.uuid();
        obj._id = _id;

        if (this._name)
          Meteor._stream.emit('livedata', {
            msg: 'method',
            method: '/' + this._name + '/insert',
            params: [obj], id: Meteor.uuid()});
        this._collection.insert(obj);

        return obj;
      },

      update: function (selector, mutator, options) {
        if (this._name)
          Meteor._stream.emit('livedata', {
            msg: 'method',
            method: '/' + this._name + '/update',
            params: [selector, mutator, options],
            id: Meteor.uuid()});
        this._collection.update(selector, mutator, options);
      },

      remove: function (selector) {
        if (arguments.length === 0)
          selector = {};

        if (this._name)
          Meteor._stream.emit('livedata', {
            msg: 'method',
            method: '/' + this._name + '/remove',
            params: [selector],
            id: Meteor.uuid()});
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
            var params = [].slice.call(arguments);

            // run the handler ourselves
            methods[method].apply(null, params);

            // tell the server to run the handler
            if (this._name)
              Meteor._stream.emit('livedata', {
                msg: 'method',
                method: '/' + this._name + '/' + method,
                params: params,
                id: Meteor.uuid()});
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
