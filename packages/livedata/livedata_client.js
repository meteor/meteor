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
  self.method_handlers = {}; // name -> func
  self.next_method_id = 1;
  self.pending_method_callbacks = {}; // map from method_id -> result function
  self.pending_method_messages = {}; // map from method_id -> message to server
  self.unsatisfied_methods = {}; // map from method_id -> true
  self.pending_data = []; // array of pending data messages

  self.subs = new LocalCollection;
  // keyed by subs._id. value is unset or an array. if set, sub is not
  // yet ready.
  self.sub_ready_callbacks = {};


  // Setup auto-reload persistence.
  var reload_key = "Server-" + url;
  var reload_data = Meteor._reload.migration_data(reload_key);
  if (typeof reload_data === "object") {
    if (typeof reload_data.next_method_id === "number")
      self.next_method_id = reload_data.next_method_id;
    if (typeof reload_data.pending_method_messages === "object")
      self.pending_method_messages = reload_data.pending_method_messages;
    // pending messages will be transmitted on initial stream 'reset'
  }
  Meteor._reload.on_migrate(reload_key, function () {
    return { next_method_id: self.next_method_id,
             pending_method_messages: self.pending_method_messages };
  });


  // Setup stream
  self.stream = new Meteor._Stream(self.url);

  self.stream.on('message', function (raw_msg) {
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

  self.stream.on('reset', function () {

    // Send a connect message at the beginning of the stream.
    // NOTE: reset is called even on the first connection, so this is
    // the only place we send this message.
    self.stream.send(JSON.stringify({msg: 'connect'}));

    // Send pending methods.
    _.each(self.pending_method_messages, function (msg) {
      self.stream.send(JSON.stringify(msg));
    });

    // add new subscriptions at the end. this way they take effect after
    // the handlers and we don't see flicker.
    self.subs.find().forEach(function (sub) {
      self.stream.send(JSON.stringify(
        {msg: 'sub', id: sub._id, name: sub.name, params: sub.args}));
    });

    // clear out the local database!
    _.each(self.collections, function (col) {
      col._collection.remove({});
    });

  });

  // we never terminate the observe(), since there is no way to
  // destroy a Server.. but this shouldn't matter, since we're the
  // only one that holds a reference to the self.subs collection
  self.subs_token = self.subs.find({}).observe({
    added: function (sub) {
      self.stream.send(JSON.stringify({
        msg: 'sub', id: sub._id, name: sub.name, params: sub.args}));
    },
    changed: function (sub) {
      if (sub.count <= 0) {
        // minimongo not re-entrant.
        _.defer(function () { self.subs.remove({_id: sub._id}); });
      }
    },
    removed: function (id) {
      self.stream.send(JSON.stringify({msg: 'unsub', id: id}));
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
      id = LocalCollection.uuid();
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

    args = _.clone(args);
    var result_func = function () {};
    if (args.length && typeof args[args.length - 1] === "function")
      result_func = args.pop();

    if (handler) {
      // run locally (if available)
      var local_args = _.clone(args);
      local_args.unshift(self.user_id);
      var ret = handler.apply(null, args);
    }

    // run on server
    self._send_method(
      {msg: 'method', method: name, params: args},
      result_func);
  },


  _send_method: function (msg, result_func) {
    var self = this;
    var method_id = self.next_method_id++;
    var new_msg = _.extend({id: method_id}, msg);
    self.pending_method_messages[method_id] = new_msg;
    self.pending_method_callbacks[method_id] = result_func || function () {};
    self.unsatisfied_methods[method_id] = true;

    self.stream.send(JSON.stringify(new_msg));
  },

  _livedata_connected: function (msg) {
    var self = this;
    // Meteor._debug("CONNECTED", msg);
  },

  _livedata_data: function (msg) {
    var self = this;

    // Add the data message to the queue
    self.pending_data.push(msg);

    // If there are still method invocations in flight, stop
    _.each(msg.methods || [], function (method_id) {
      delete self.unsatisfied_methods[method_id];
    });
    for (var method_id in self.unsatisfied_methods)
      return;

    // All methods have landed. Blow away local changes and replace
    // with authoritative changes from server.

    _.each(self.collections, function (coll) {
      if (coll._was_snapshot) {
        coll._collection.restore(); // Revert all local changes
        coll._was_snapshot = false;
      }
    });

    _.each(self.pending_data, function (msg) {
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
    });

    self.pending_data = [];
  },

  _livedata_nosub: function (msg) {
    var self = this;
    // Meteor._debug("NOSUB", msg);
  },

  _livedata_result: function (msg) {
    var self = this;
    // id, result or error. error has error (code), reason, details

    if (('id' in msg) && (msg.id in self.pending_method_messages)) {
      delete self.pending_method_messages[msg.id];
    } else {
      // XXX write a better error
      Meteor._debug("Can't interpret method response message");
    }

    if (('id' in msg) && (msg.id in self.pending_method_callbacks)) {
      var func = self.pending_method_callbacks[msg.id];
      delete self.pending_method_callbacks[msg.id];
      // XXX wrap in try..catch?
      if ('error' in msg)
        func(msg.error);
      else
        func(undefined, msg.result);
    } else {
      // If a response is to a method we sent from reload pending methods,
      // it won't have a callback. This is OK. This will get revisited
      // when we do more intellegent auto-reloads where we wait to
      // quiesce, pre-stage cached assets, etc.
    }
  }
});

Meteor._Collection = function (name, server) {
  var self = this;

  if (name && (name in server.collections))
    // maybe should just return server.collections[name]?
    throw new Error("There is already a remote collection '" + name + "'");

  self._name = name;
  self._collection = new LocalCollection;
  self._server = server;
  self._was_snapshot = false;

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

  _maybe_snapshot: function () {
    var self = this;
    if (!self._was_snapshot) {
      self._collection.snapshot();
      self._was_snapshot = true;
    }
  },

  // XXX provide a way for the caller to find out about errors from the server?
  insert: function (obj) {
    var self = this;
    // Generate an id for the object.
    // XXX mutates the object passed in. that is not cool.
    if (obj._id)
      Meteor._debug("WARNING: trying to insert object w/ _id set. _id ignored.");
    if (_.keys(obj).length === 0)
      Meteor._debug("WARNING: inserting empty object.");

    var _id = LocalCollection.uuid();
    obj._id = _id;

    if (self._name) {
      self._maybe_snapshot();
      self._server._send_method({
        msg: 'method',
        method: '/' + self._name + '/insert',
        params: [obj]});
    }
    self._collection.insert(obj);

    return obj;
  },

  // XXX provide a way for the caller to find out about errors from the server?
  update: function (selector, mutator, options) {
    var self = this;
    if (self._name) {
      self._maybe_snapshot();
      self._server._send_method({
        msg: 'method',
        method: '/' + self._name + '/update',
        params: [selector, mutator, options]});
    }
    self._collection.update(selector, mutator, options);
  },

  // XXX provide a way for the caller to find out about errors from the server?
  remove: function (selector) {
    var self = this;

    if (arguments.length === 0)
      selector = {};

    if (self._name) {
      self._maybe_snapshot();
      self._server._send_method({
        msg: 'method',
        method: '/' + self._name + '/remove',
        params: [selector]});
    }
    self._collection.remove(selector);
  },

  schema: function  () {
    // XXX not implemented yet
  }
});

// Path matches sockjs 'prefix' in stream_server. We should revisit this
// once we specify the 'on the wire' aspects of livedata more clearly.
App = new Meteor.Server('/sockjs');

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
