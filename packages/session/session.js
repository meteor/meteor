// XXX could use some tests

Session = _.extend({}, {
  keys: {}, // key -> value
  key_deps: {}, // key -> ContextSet
  key_value_deps: {}, // key -> value -> ContextSet

  set: function (key, value) {
    var self = this;

    var old_value = self.keys[key];
    if (value === old_value)
      return;
    self.keys[key] = value;

    var invalidateAll = function (set) {
      set && set.invalidateAll();
    };

    invalidateAll(self.key_deps[key]);
    if (self.key_value_deps[key]) {
      invalidateAll(self.key_value_deps[key][old_value]);
      invalidateAll(self.key_value_deps[key][value]);
    }
  },

  get: function (key) {
    var self = this;
    var context = Meteor.deps.Context.current;
    if (context) {
      self._ensureKey(key);
      self.key_deps[key].add(context);
    }
    return self.keys[key];
  },

  equals: function (key, value) {
    var self = this;
    var context = Meteor.deps.Context.current;

    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null && value !== undefined)
      throw new Error("Session.equals: value can't be an object");

    if (context) {
      self._ensureKey(key);

      if (!(value in self.key_value_deps[key]))
        self.key_value_deps[key][value] = new Meteor.deps.ContextSet;

      var isNew = self.key_value_deps[key][value].add(context);
      if (isNew) {
        context.on_invalidate(function () {
          // clean up [key][value] if it's now empty, so we don't use
          // O(n) memory for n = values seen ever
          if (self.key_value_deps[key][value].isEmpty())
            delete self.key_value_deps[key][value];
        });
      }
    }

    return self.keys[key] === value;
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.key_deps)) {
      self.key_deps[key] = new Meteor.deps.ContextSet;
      self.key_value_deps[key] = new Meteor.deps.ContextSet;
    }
  }
});


if (Meteor._reload) {
  Meteor._reload.on_migrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    return [true, {keys: Session.keys}];
  });

  (function () {
    var migration_data = Meteor._reload.migration_data('session');
    if (migration_data && migration_data.keys) {
      Session.keys = migration_data.keys;
    }
  })();
}
