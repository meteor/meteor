(function () {

  // XXX come up with a serialization method which canonicalizes object key
  // order, which would allow us to use objects as values for equals.
  var stringify = function (value) {
    if (value === undefined)
      return 'undefined';
    return EJSON.stringify(value);
  };
  var parse = function (serialized) {
    if (serialized === undefined || serialized === 'undefined')
      return undefined;
    return EJSON.parse(serialized);
  };

  Session = _.extend({}, {
    keys: {}, // key -> value
    keyVars: {}, // key -> Variable
    keyValueVars: {}, // key -> value -> Variable

    set: function (key, value) {
      var self = this;

      value = stringify(value);

      var oldSerializedValue = 'undefined';
      if (_.has(self.keys, key)) oldSerializedValue = self.keys[key];
      if (value === oldSerializedValue)
        return;
      self.keys[key] = value;

      var changed = function (v) {
        v && v.changed();
      };

      changed(self.keyVars[key]);
      if (self.keyValueVars[key]) {
        changed(self.keyValueVars[key][oldSerializedValue]);
        changed(self.keyValueVars[key][value]);
      }
    },

    setDefault: function (key, value) {
      var self = this;
      // for now, explicitly check for undefined, since there is no
      // Session.clear().  Later we might have a Session.clear(), in which case
      // we should check if it has the key.
      if (self.keys[key] === undefined) {
        self.set(key, value);
      }
    },

    get: function (key) {
      var self = this;
      self._ensureKey(key);
      Deps.depend(self.keyVars[key]);
      return parse(self.keys[key]);
    },

    equals: function (key, value) {
      var self = this;

      // We don't allow objects (or arrays that might include objects) for
      // .equals, because JSON.stringify doesn't canonicalize object key
      // order. (We can make equals have the right return value by parsing the
      // current value and using EJSON.equals, but we won't have a canonical
      // element of keyValueVars[key] to store the dependency.) You can still use
      // "EJSON.equals(Session.get(key), value)".
      //
      // XXX we could allow arrays as long as we recursively check that there
      // are no objects
      if (typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean' &&
          typeof value !== 'undefined' &&
          !(value instanceof Date) &&
          !(typeof Meteor.Collection !== 'undefined' && value instanceof Meteor.Collection.ObjectID) &&
          value !== null)
        throw new Error("Session.equals: value must be scalar");
      var serializedValue = stringify(value);

      if (Deps.active) {
        self._ensureKey(key);

        if (! _.has(self.keyValueVars[key], serializedValue))
          self.keyValueVars[key][serializedValue] = new Deps.Variable;

        var isNew = Deps.depend(self.keyValueVars[key][serializedValue]);
        if (isNew) {
          Deps.currentComputation.onInvalidate(function () {
            // clean up [key][serializedValue] if it's now empty, so we don't
            // use O(n) memory for n = values seen ever
            if (! self.keyValueVars[key][serializedValue].hasDependents())
              delete self.keyValueVars[key][serializedValue];
          });
        }
      }

      var oldValue = undefined;
      if (_.has(self.keys, key)) oldValue = parse(self.keys[key]);
      return EJSON.equals(oldValue, value);
    },

    _ensureKey: function (key) {
      var self = this;
      if (!(key in self.keyVars)) {
        self.keyVars[key] = new Deps.Variable;
        self.keyValueVars[key] = {};
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
