(function () {

  // XXX come up with a serialization method which canonicalizes object key
  // order, which would allow us to use objects as values for equals.
  var stringify = function (value) {
    if (value === undefined)
      return 'undefined';
    return JSON.stringify(value);
  };
  var parse = function (serialized) {
    if (serialized === undefined || serialized === 'undefined')
      return undefined;
    return JSON.parse(serialized);
  };

  Session = _.extend({}, {
    keys: {}, // key -> value
    keyDeps: {}, // key -> _ContextSet
    keyValueDeps: {}, // key -> value -> _ContextSet

    set: function (key, value) {
      var self = this;

      value = stringify(value);

      var oldSerializedValue = 'undefined';
      if (_.has(self.keys, key)) oldSerializedValue = self.keys[key];
      if (value === oldSerializedValue)
        return;
      self.keys[key] = value;

      var invalidateAll = function (cset) {
        cset && cset.invalidateAll();
      };

      invalidateAll(self.keyDeps[key]);
      if (self.keyValueDeps[key]) {
        invalidateAll(self.keyValueDeps[key][oldSerializedValue]);
        invalidateAll(self.keyValueDeps[key][value]);
      }
    },

    get: function (key) {
      var self = this;
      self._ensureKey(key);
      self.keyDeps[key].addCurrentContext();
      return parse(self.keys[key]);
    },

    equals: function (key, value) {
      var self = this;
      var context = Meteor.deps.Context.current;

      // We don't allow objects (or arrays that might include objects) for
      // .equals, because JSON.stringify doesn't canonicalize object key
      // order. (We can make equals have the right return value by parsing the
      // current value and using _.isEqual, but we won't have a canonical
      // element of keyValueDeps[key] to store the context.) You can still use
      // "_.isEqual(Session.get(key), value)".
      //
      // XXX we could allow arrays as long as we recursively check that there
      // are no objects
      if (typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean' &&
          typeof value !== 'undefined' &&
          value !== null)
        throw new Error("Session.equals: value must be scalar");
      var serializedValue = stringify(value);

      if (context) {
        self._ensureKey(key);

        if (! _.has(self.keyValueDeps[key], serializedValue))
          self.keyValueDeps[key][serializedValue] = new Meteor.deps._ContextSet;

        var isNew = self.keyValueDeps[key][serializedValue].add(context);
        if (isNew) {
          context.onInvalidate(function () {
            // clean up [key][serializedValue] if it's now empty, so we don't
            // use O(n) memory for n = values seen ever
            if (self.keyValueDeps[key][serializedValue].isEmpty())
              delete self.keyValueDeps[key][serializedValue];
          });
        }
      }

      var oldValue = undefined;
      if (_.has(self.keys, key)) oldValue = parse(self.keys[key]);
      return oldValue === value;
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

}());
