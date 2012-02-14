// list of subscription tokens outstanding during a
// captureDependencies run. only set when we're doing a run. The fact
// that this is a singleton means we can't do recursive
// Meteor.subscriptions(). But what would that even mean?
// XXX namespacing
Meteor._capture_subs = null;

Meteor._LivedataConnection = function (url) {
  var self = this;
  self.url = url;
  self.stores = {}; // name -> object with methods
  self.method_handlers = {}; // name -> func
  self.next_method_id = 1;
  self.pending_method_callbacks = {}; // map from method_id -> result function
  self.pending_method_messages = {}; // map from method_id -> message to server
  self.unsatisfied_methods = {}; // map from method_id -> true
  self.pending_data = []; // array of pending data messages
  self.queued = {}; // name -> updates for (yet to be created) collection

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

    // XXX this causes flicker ("database flap") and needs to be
    // rewritten. we should wait until we found out if we successfully
    // resumed the stream. if so, we need do nothing special. if not,
    // we need to put a reset message in pending_data (optionally
    // clearing pending_data and queued first, as an optimization),
    // and defer processing pending_data until all of the
    // subscriptions that we previously told the user were ready, are
    // now once again ready. then, when we do go to process the
    // messages, we need to do it in one atomic batch (the reset and
    // the redeliveries together) so that livequeries don't observe
    // spurious 'added' and 'removed' messages, which would cause, eg,
    // DOM elements to fail to get semantically matched, leading to a
    // loss of focus/input state.
    _.each(self.stores, function (s) { s.reset(); });
    self.pending_data = [];
    self.queued = {};
  });

  // we never terminate the observe(), since there is no way to
  // destroy a LivedataConnection.. but this shouldn't matter, since we're
  // the only one that holds a reference to the self.subs collection
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

_.extend(Meteor._LivedataConnection.prototype, {
  // 'name' is the name of the data on the wire that should go in the
  // store. 'store' should be an object with methods beginUpdate,
  // update, endUpdate, reset. see Collection for an example.
  registerStore: function (name, store) {
    var self = this;

    if (name in self.stores)
      return false;
    self.stores[name] = store;

    store.beginUpdate();
    _.each(self.queued[name] || [], function (msg) {
      store.update(msg);
    });
    store.endUpdate();
    delete self.queued[name];

    return true;
  },

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
    var result_func;

    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    args = _.clone(args);
    if (args.length && typeof args[args.length - 1] === "function")
      result_func = args.pop();

    if (handler) {
      // run locally (if we have a stub for it)
      var local_args = _.clone(args);
      local_args.unshift(self.user_id);
      var ret = handler.apply(null, args);
    }

    // Note that it is important that the function totally complete,
    // locally, before the message is sent to the server. (Or at
    // least, we need to guarantee that the snapshot is not restored
    // until the local copy of the function has stopped doing writes.)

    // XXX would it be better form to do the binding in stream.on,
    // instead of here?
    result_func = Meteor.bindEnvironment(result_func, function (e) {
      // XXX improve error message (and how we report it)
      Meteor._debug("Exception while delivering result of invoking '" +
                    name + "'", e.stack);
    });

    // run on server
    self._send_method(
      {msg: 'method', method: name, params: args},
      result_func);

    return ret;
  },

  status: function () {
    var self = this;
    return self.stream.status();
  },

  reconnect: function () {
    var self = this;
    return self.stream.reconnect();
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

    _.each(self.stores, function (s) { s.beginUpdate(); });

    _.each(self.pending_data, function (msg) {
      if (msg.collection && msg.id) {
        var store = self.stores[msg.collection];

        if (!store) {
          // Nobody's listening for this data. Queue it up until
          // someone wants it.
          // XXX memory use will grow without bound if you forget to
          // create a collection.. going to have to do something about
          // that.
          if (!(msg.collection in self.queued))
            self.queued[msg.collection] = [];
          self.queued[msg.collection].push(msg);
          return;
        }

        store.update(msg);
      }

      if (msg.subs) {
        _.each(msg.subs, function (id) {
          var arr = self.sub_ready_callbacks[id];
          if (arr) _.each(arr, function (c) { c(); });
          delete self.sub_ready_callbacks[id];
        });
      }
    });

    _.each(self.stores, function (s) { s.endUpdate(); });

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

_.extend(Meteor, {
  connect: function (url) {
    return new Meteor._LivedataConnection(url);
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

