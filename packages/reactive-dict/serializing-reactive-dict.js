SerializingReactiveDict = function (dictName) {
  ReactiveDict.call(this);

  // Used for .equals to make sure we only fire a change when the equality state
  // changes
  this.keyValueDeps = {};

  // this.keys: key -> value
  if (dictName) {
    if (typeof dictName === 'string') {
      // the normal case, argument is a string name.
      // _registerDictForMigrate will throw an error on duplicate name.
      ReactiveDict._registerDictForMigrate(dictName, this);
      this.keys = ReactiveDict._loadMigratedDict(dictName) || {};
    } else if (typeof dictName === 'object') {
      // XXX COMPAT WITH 0.9.1 : accept migrationData instead of dictName
      this.keys = dictName;
    } else {
      throw new Error("Invalid SerializingReactiveDict argument: " + dictName);
    }
  }
};

Meteor._inherits(SerializingReactiveDict, ReactiveDict);

_.extend(SerializingReactiveDict.prototype, {
  _convert: function (value) {
    // XXX come up with a serialization method which canonicalizes object key
    // order, which would allow us to use objects as values for equals.
    if (value === undefined) {
      return 'undefined';
    }

    return EJSON.stringify(value);
  },
  _unConvert: function (serialized) {
    if (serialized === undefined || serialized === 'undefined') {
      return undefined;
    }

    return EJSON.parse(serialized);
  },
  set: function (key, value) {
    var self = this;
    var oldValue = this.keys[key];

    ReactiveDict.prototype.set.call(this, key, value);

    if (self.keyValueDeps[key]) {
      changed(self.keyValueDeps[key][oldValue]);
      changed(self.keyValueDeps[key][value]);
    }
  },
  equals: function (key, value) {
    var self = this;

    // Mongo.ObjectID is in the 'mongo' package
    var ObjectID = null;
    if (typeof Package.mongo !== 'undefined') {
      ObjectID = Package.mongo.Mongo.ObjectID;
    }

    // We don't allow objects (or arrays that might include objects) for
    // .equals, because JSON.stringify doesn't canonicalize object key
    // order. (We can make equals have the right return value by parsing the
    // current value and using EJSON.equals, but we won't have a canonical
    // element of keyValueDeps[key] to store the dependency.) You can still use
    // "EJSON.equals(reactiveDict.get(key), value)".
    //
    // XXX we could allow arrays as long as we recursively check that there
    // are no objects
    if (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        typeof value !== 'undefined' &&
        !(value instanceof Date) &&
        !(ObjectID && value instanceof ObjectID) &&
        value !== null)
      throw new Error("ReactiveDict.equals: value must be scalar");

    var serializedValue = self._convert(value);

    if (Tracker.active) {
      self._ensureKey(key);

      if (! _.has(self.keyValueDeps[key], serializedValue))
        self.keyValueDeps[key][serializedValue] = new Tracker.Dependency;

      var isNew = self.keyValueDeps[key][serializedValue].depend();
      if (isNew) {
        Tracker.onInvalidate(function () {
          // clean up [key][serializedValue] if it's now empty, so we don't
          // use O(n) memory for n = values seen ever
          if (! self.keyValueDeps[key][serializedValue].hasDependents())
            delete self.keyValueDeps[key][serializedValue];
        });
      }
    }

    var oldValue = undefined;
    if (_.has(self.keys, key)) oldValue = self._unConvert(self.keys[key]);
    return EJSON.equals(oldValue, value);
  },

  _ensureKey: function (key) {
    ReactiveDict.prototype._ensureKey.call(this, key);

    var self = this;
    if (!(key in self.keyValueDeps)) {
      self.keyValueDeps[key] = {};
    }
  },

  _getMigrationData: function () {
    return this.keys;
  }
});
