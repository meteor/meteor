// XXX could use some tests

Session = _.extend({}, {
  keys: {}, // key -> value
  keyDeps: {}, // key -> _ContextSet
  keyValueDeps: {}, // key -> value -> _ContextSet

  set: function (key, value) {
    var self = this;

    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null && value !== undefined)
      throw new Error("Session.set: value can't be an object");

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
        self.keyValueDeps[key][value] = new Meteor.deps._ContextSet;

      var isNew = self.keyValueDeps[key][value].add(context);
      if (isNew) {
        context.onInvalidate(function () {
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
      self.keyDeps[key] = new Meteor.deps._ContextSet;
      self.keyValueDeps[key] = {};
    }
  }
});


if (Meteor._reload) {
  Meteor._reload.onMigrate('session', function () {
    // XXX sanitize and make sure it's JSONible?
    return [true, {keys: Session.keys}];
  });

  (function () {
    var migrationData = Meteor._reload.migrationData('session');
    if (migrationData && migrationData.keys) {
      Session.keys = migrationData.keys;
    }
  })();
}
