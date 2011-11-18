Session = Class("Session");

// XXX could use some tests

Session.constructor(function (_super) {
  var self = this;
  _super();

  self.keys = {};

  self.deps = Sky.deps; // XXX XXX

  self.key_callbacks = {}; // key -> id -> true
  self.key_value_callbacks = {}; // key -> value -> id -> true
  self.callbacks = {}; // id -> func
  self.callback_deps = {}; // id -> key || {key: key, value: value}

  self.oneshot = {}; // id -> boolean
});

Session.methods({
  // XXX remove debugging method (or improve it, but anyway, don't
  // ship it in production)
  dump_state: function () {
    var self = this;
    console.log("=== Session state ===");
    for (var key in self.key_callbacks) {
      var ids = _.keys(self.key_callbacks[key]);
      if (!ids.length)
        continue;
      console.log(key + ": " + _.map(ids, function (x) {return x.substr(0,4);}).join(' '));
    }

    for (var key in self.key_value_callbacks) {
      for (var value in self.key_value_callbacks[key]) {
        var ids = _.keys(self.key_value_callbacks[key][value]);
        if (!ids.length)
          continue;
        console.log(key + "(" + value + "): " + _.map(ids, function (x) {return x.substr(0,4);}).join(' '));
      }
    }
  },

  set: function (key, value) {
    var self = this;

    var old_value = self.keys[key];
    if (value === old_value)
      return;
    self.keys[key] = value;
    self._ensureKey(key);

    var activated = {};
    for (var id in self.key_callbacks[key])
      activated[id] = true;
    if (old_value in self.key_value_callbacks[key])
      for (var id in self.key_value_callbacks[key][old_value])
        activated[id] = true;
    if (value in self.key_value_callbacks[key])
      for (var id in self.key_value_callbacks[key][value])
        activated[id] = true;

    for (var id in activated)
      self._fireCallback(id);
  },

  get: function (key) {
    var self = this;

    var id = Collection._genId(); // XXX expose genid cleanly!
    var invalidation = self.deps.getInvalidationFunction(function () {
      self._cleanupCallbacks(id);
    });

    if (invalidation) {
      self._ensureKey(key);
      self.key_callbacks[key][id] = true;
      self.callbacks[id] = invalidation;
      self.callback_deps[id] = key;
    }

    return self.keys[key];
  },

  equals: function (key, value) {
    var self = this;

    if (typeof(value) !== 'string' &&
        typeof(value) !== 'number' &&
        typeof(value) !== 'boolean' &&
        value !== null && value !== undefined)
      throw new Error("Session.equals: value can't be an object");

    var id = Collection._genId(); // XXX expose genid cleanly!
    var invalidation = self.deps.getInvalidationFunction(function () {
      self._cleanupCallbacks(id);
    });

    if (invalidation) {
      self._ensureKey(key);
      if (!(value in self.key_value_callbacks[key]))
        self.key_value_callbacks[key][value] = {};
      self.key_value_callbacks[key][value][id] = true;
      self.callbacks[id] = invalidation;
      self.callback_deps[id] = {key: key, value: value};
    }

    return self.keys[key] === value;
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.key_callbacks)) {
      self.key_callbacks[key] = {};
      self.key_value_callbacks[key] = {};
    }
  },

  _fireCallback: function (id) {
    var self = this;
    var callback = self.callbacks[id];

    if (callback)
      callback();

    delete self.callbacks[id];

    // not strictly needed, as we'll get at least one back, but it
    // doesn't hurt.
    self._cleanupCallbacks(id);
  },

  _cleanupCallbacks: function (id) {
    var self = this;
    var deps = self.callback_deps[id];

    if (deps) {
      if (typeof(deps) === 'string')
        delete self.key_callbacks[deps][id];
      else
        delete self.key_value_callbacks[deps.key][deps.value][id];
    }

    delete self.callbacks[id];
    delete self.callback_deps[id];
  }

});

// singleton
Session = Session.create();
