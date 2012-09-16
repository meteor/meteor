// XXX could use some tests

Session = _.extend({}, {
  keys: {}, // key -> value
  keyDeps: {}, // key -> ContextSet
  keyValueDeps: {}, // key -> value -> ContextSet

  set: function (key, value) {
    var self = this;

    var oldValue = self.keys[key];
    if (value === oldValue)
      return;
    self.keys[key] = value;

    var invalidateAll = function (cset) {
      cset && cset.invalidateAll();
    };

    invalidateAll(self.keyDeps[key]);
    if (self.keyValueDeps[key]) {
      invalidateAll(self.keyValueDeps[key][oldValue]);
      invalidateAll(self.keyValueDeps[key][value]);
    }
  },

  get: function (key) {
    var self = this;
    self._ensureKey(key);
    self.keyDeps[key].addCurrentContext();
    return self.keys[key];
  },

  equals: function (key, value) {
    var self = this;
    var context = Meteor.deps.Context.current;

    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        typeof value !== 'undefined' &&
        value !== null)
      throw new Error("Session.equals: value can't be an object");

    if (context) {
      self._ensureKey(key);

      if (!(value in self.keyValueDeps[key]))
        self.keyValueDeps[key][value] = new Meteor.deps.ContextSet;

      var isNew = self.keyValueDeps[key][value].add(context);
      if (isNew) {
        context.on_invalidate(function () {
          // clean up [key][value] if it's now empty, so we don't use
          // O(n) memory for n = values seen ever
          if (self.keyValueDeps[key][value].isEmpty())
            delete self.keyValueDeps[key][value];
        });
      }
    }

    return self.keys[key] === value;
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.keyDeps)) {
      self.keyDeps[key] = new Meteor.deps.ContextSet;
      self.keyValueDeps[key] = new Meteor.deps.ContextSet;
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
