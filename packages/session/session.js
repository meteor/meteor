Session = _.extend({}, {
  keys: [],
  data: {},
  
  // XXX remove debugging method (or improve it, but anyway, don't
  // ship it in production)
  dump_state: function () {
    var self = this;
    console.log("=== Session state ===");
    for (var key in self.key_deps) {
      var ids = _.keys(self.key_deps[key]);
      if (!ids.length)
        continue;
      console.log(key + ": " + _.reject(ids, function (x) {return x === "_once"}).join(' '));
    }

    for (var key in self.key_value_deps) {
      for (var value in self.key_value_deps[key]) {
        var ids = _.keys(self.key_value_deps[key][value]);
        if (!ids.length)
          continue;
        console.log(key + "(" + value + "): " + _.reject(ids, function (x) {return x === "_once";}).join(' '));
      }
    }
  },

  set: function (key, value) {
    var self = this;
    self._ensureKey(key);
    self.data[key].set(value);
  },

  get: function (key) {
    var self = this;
    self._ensureKey(key);
    return self.data[key]();
  },

  equals: function (key, value) {
    var self = this;
    self._ensureKey(key);
    return self.data[key].equals(value);
  },

  _ensureKey: function (key) {
    var self = this;
    if (_.indexOf(self.keys, key) == -1) {
      self.keys.push(key);
      Meteor.deps.add_reactive_variable(self.data, key);
    }
  }
});


if (Meteor._reload) {
  Meteor._reload.on_migrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    var data = {};
    _.each(Session.keys, function(key) {
      data[key] = Session.data[key](true);
    });
    return [true, {data: data}];
  });

  (function () {
    var migration_data = Meteor._reload.migration_data('session');
    if (migration_data && migration_data.data) {
      for (var key in migration_data.data) {
        Session.set(key, migration_data.data[key])
      }
    }
  })();
}
