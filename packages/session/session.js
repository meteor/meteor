Session = Class("Session");

// XXX could use some tests

Session.constructor(function (_super) {
  var self = this;
  _super();

  self.keys = {};

  self.next_id = 1;
  self.key_callbacks = {}; // key -> id -> func
  self.key_value_callbacks = {}; // key -> value -> id -> func
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
      self.key_callbacks[key][id]();

    if (old_value in self.key_value_callbacks[key])
      for (var id in self.key_value_callbacks[key][old_value])
        self.key_value_callbacks[key][old_value][id]();

    if (value in self.key_value_callbacks[key])
      for (var id in self.key_value_callbacks[key][value])
        self.key_value_callbacks[key][value][id]();
  },

  get: function (key) {
    var self = this;

    if (Sky.deps.monitoring) {
      var id = self.next_id++;

      self._ensureKey(key);
      self.key_callbacks[key][id] = Sky.deps.getInvalidate();

      Sky.deps.cleanup(function () {
        delete self.key_callbacks[key][id];
      });
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

    if (Sky.deps.monitoring) {
      var id = self.next_id++;

      self._ensureKey(key);
      if (!(value in self.key_value_callbacks[key]))
        self.key_value_callbacks[key][value] = {};
      self.key_value_callbacks[key][value][id] = Sky.deps.getInvalidate();

      Sky.deps.cleanup(function () {
        delete self.key_value_callbacks[key][value][id];

        // clean up [key][value] if it's now empty, so we don't use
        // O(n) memory for n = values seen ever
        for (var x in self.key_value_callbacks[key][value])
          return;
        delete self.key_value_callbacks[key][value];
      });
    }

    return self.keys[key] === value;
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.key_callbacks)) {
      self.key_callbacks[key] = {};
      self.key_value_callbacks[key] = {};
    }
  }
});

// singleton
Session = Session.create();
