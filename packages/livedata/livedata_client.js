if (typeof Meteor === "undefined") Meteor = {};

// list of subscription tokens outstanding during a
// captureDependencies run. only set when we're doing a run. The fact
// that this is a singleton means we can't do recursive
// Meteor.subscriptions(). But who wants that? What does that even mean?
// XXX namespacing
Meteor._capture_subs = null;

Meteor.Server = function (url) {
  var self = this;
  self.url = url;
  self.collections = {}; // name -> Collection-type object

  self.subs = new Collection;
  // keyed by subs._id. value is unset or an array. if set, sub is not
  // yet ready.
  self.sub_ready_callbacks = {};

  self.stream = new Meteor._Stream(self.url);

  // all socket.io traffic is framed as a "livedata" message.
  self.stream.on('livedata', function (msg) {
    if (typeof(msg) !== 'object' || !msg.msg) {
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
    else
      Meteor._debug("discarding unknown livedata message type", msg);
  });

  self.stream.reset(function (msg_list) {
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
    self.subs.find().forEach(function (sub) {
      msg_list.push(
        ['livedata',
         {msg: 'sub', id: sub._id, name: sub.name, params: sub.args}]);
    });

    // clear out the local database!
    _.each(self.collections, function (col) {
      col._collection.remove({});
    });

    return msg_list;
  });

  // we never terminate the observe(), since there is no way to
  // destroy a Server.. but this shouldn't matter, since we're the
  // only one that holds a reference to the self.subs collection
  self.subs_token = self.subs.find({}).observe({
    added: function (sub) {
      self.stream.emit('livedata', {
        msg: 'sub', id: sub._id, name: sub.name, params: sub.args});
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { self.subs.remove({_id: sub._id}); });
      }
    },
    removed: function (id) {
      self.stream.emit('livedata', {msg: 'unsub', id: id});
    }
  });
};

_.extend(Meteor.Server.prototype, {
  subscribe: function (name, args, callback) {
    var self = this;
    var id;
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
      id = Collection.uuid();
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

  _livedata_connected: function (msg) {
    var self = this;

    // Meteor._debug("CONNECTED", msg);
  },

  _livedata_data: function (msg) {
    var self = this;

    if (msg.collection && msg.id) {
      var meteor_coll = self.collections[msg.collection];

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
        var arr = self.sub_ready_callbacks[id];
        if (arr) _.each(arr, function (c) { c(); });
        delete self.sub_ready_callbacks[id];
      });
    }
    if (msg.methods) {
      // Meteor._debug("METHODCOMPLETE", msg.methods);
    }
  },

  _livedata_nosub: function (msg) {
    var self = this;
    // Meteor._debug("NOSUB", msg);
  },

  _livedata_result: function (msg) {
    var self = this;
    // Meteor._debug("RESULT", msg);
  }
});

Meteor._Collection = function (name, server) {
  var self = this;

  if (name && (name in server.collections))
    // maybe should just return server.collections[name]?
    throw new Error("There is already a remote collection '" + name + "'");

  self._name = name;
  self._collection = new Collection;
  self._server = server;

  if (name)
    server.collections[name] = self;
};

_.extend(Meteor._Collection.prototype, {
  find: function (/* selector, options */) {
    var self = this;
    // Collection.find() (return all docs) behaves differently
    // from Collection.find(undefined) (return 0 docs).  so be
    // careful about preserving the length of arguments when
    // descending into minimongo.
    return self._collection.find.apply(self._collection, Array.prototype.slice.call(arguments));
  },

  findOne: function (/* selector, options */) {
    var self = this;
    // as above
    return self._collection.findOne.apply(self._collection, Array.prototype.slice.call(arguments));
  },

  insert: function (obj) {
    var self = this;
    // Generate an id for the object.
    // XXX mutates the object passed in. that is not cool.
    if (obj._id)
      Meteor._debug("WARNING: trying to insert object w/ _id set");
      var _id = Collection.uuid();
      obj._id = _id;

      if (self._name)
        self._server.stream.emit('livedata', {
          msg: 'method',
          method: '/' + self._name + '/insert',
          params: [obj], id: Meteor.uuid()});
      self._collection.insert(obj);

      return obj;
    },

  update: function (selector, mutator, options) {
    var self = this;
    if (self._name)
      self._server.stream.emit('livedata', {
        msg: 'method',
        method: '/' + self._name + '/update',
        params: [selector, mutator, options],
        id: Meteor.uuid()});
    self._collection.update(selector, mutator, options);
  },

  remove: function (selector) {
    var self = this;

    if (arguments.length === 0)
      selector = {};

    if (self._name)
      self._server.stream.emit('livedata', {
        msg: 'method',
        method: '/' + self._name + '/remove',
        params: [selector],
        id: Meteor.uuid()});
    self._collection.remove(selector);
  },

  schema: function  () {
    // XXX not implemented yet
  },

  api: function (methods) {
    var self = this;

    _.each(methods, function (func, method) {
      self[method] = function (/* arguments */) {
        // (must turn 'arguments' into a plain array so as not to
        // confuse stringify)
        var params = [].slice.call(arguments);

        // run the handler ourselves
        methods[method].apply(null, params);

        // tell the server to run the handler
        if (self._name)
          self._server.stream.emit('livedata', {
            msg: 'method',
            method: '/' + self._name + '/' + method,
            params: params,
            id: Meteor.uuid()});
      };
    }, self);
  }
});


App = new Meteor.Server('/');

_.extend(Meteor, {
  is_server: false,
  is_client: true,

  // XXX these are wrong
  status: function () {
    return App.stream.status();
  },

  reconnect: function () {
    return App.stream.reconnect();
  },

  reset: function (callback) {
    return App.stream.reset(callback);
  },

  publish: function() {
    // ignored on the client
  },

  // XXX make the user create it directly, with 'new'
  Collection: function (name) {
    return new Meteor._Collection(name, App);
  },

  subscribe: function (/* arguments */) {
    return App.subscribe.apply(App, _.toArray(arguments));
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
