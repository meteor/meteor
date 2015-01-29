// XXX come up with a serialization method which canonicalizes object key
// order, which would allow us to use objects as values for equals.
var stringify = function(value) {
  if (value === undefined)
    return 'undefined';
  return EJSON.stringify(value);
};
var parse = function(serialized) {
  if (serialized === undefined || serialized === 'undefined')
    return undefined;
  return EJSON.parse(serialized);
};

// XXX COMPAT WITH 0.9.1 : accept migrationData instead of dictName
ReactiveDict = function(dictName) {
  // this.keys: key -> value
  if (dictName) {
    if (typeof dictName === 'string') {
      // the normal case, argument is a string name.
      // _registerDictForMigrate will throw an error on duplicate name.
      ReactiveDict._registerDictForMigrate(dictName, this);
      this.keys = ReactiveDict._loadMigratedDict(dictName) || {};
    } else if (typeof dictName === 'object') {
      // back-compat case: dictName is actually migrationData
      this.keys = dictName;
    } else {
      throw new Error("Invalid ReactiveDict argument: " + dictName);
    }
  } else {
    // no name given; no migration will be performed
    this.keys = {};
  }

  this.keyDeps = {}; // key -> Dependency
  this.keyValueDeps = {}; // key -> Dependency
};

_.extend(ReactiveDict.prototype, {
  // set() began as a key/value method, but we are now overloading it
  // to take an object of key/value pairs, similar to backbone
  // http://backbonejs.org/#Model-set

  set: function(key_or_object, value) {
    var self = this;

    if ((typeof key_or_object === 'object') && (value === undefined)) {
      self._setObject(key_or_object);
      return;
    }

    value = stringify(value);

    var oldSerializedValue = 'undefined';
    if (_.has(self.keys, key_or_object)) oldSerializedValue = self.keys[key_or_object];
    if (value === oldSerializedValue)
      return;
    self.keys[key_or_object] = value;

    var changed = function(v) {
      v && v.changed();
    };

    changed(self.keyDeps[key_or_object]);
    if (self.keyValueDeps[key_or_object]) {
      changed(self.keyValueDeps[key_or_object][oldSerializedValue]);
      changed(self.keyValueDeps[key_or_object][value]);
    }
  },

  setDefault: function(key, value) {
    var self = this;
    // for now, explicitly check for undefined, since there is no
    // ReactiveDict.clear().  Later we might have a ReactiveDict.clear(), in which case
    // we should check if it has the key.
    if (self.keys[key] === undefined) {
      self.set(key, value);
    }
  },

  get: function(key) {
    var self = this;
    self._ensureKey(key);
    self.keyDeps[key].depend();
    return parse(self.keys[key]);
  },

  equals: function(key, value) {
    var self = this;

    // Mongo.ObjectID is in the 'mongo' package
    var ObjectID = null;
    if (typeof Mongo !== 'undefined') {
      ObjectID = Mongo.ObjectID;
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
    var serializedValue = stringify(value);

    if (Tracker.active) {
      self._ensureKey(key);

      if (!_.has(self.keyValueDeps[key], serializedValue))
        self.keyValueDeps[key][serializedValue] = new Tracker.Dependency;

      var isNew = self.keyValueDeps[key][serializedValue].depend();
      if (isNew) {
        Tracker.onInvalidate(function() {
          // clean up [key][serializedValue] if it's now empty, so we don't
          // use O(n) memory for n = values seen ever
          if (!self.keyValueDeps[key][serializedValue].hasDependents())
            delete self.keyValueDeps[key][serializedValue];
        });
      }
    }

    var oldValue = undefined;
    if (_.has(self.keys, key)) oldValue = parse(self.keys[key]);
    return EJSON.equals(oldValue, value);
  },
  clear: function(key) {
    var self = this;
    self.set(key, null);
    return true;
  },
  toggle: function(key) {
    var self = this;

    // toggle currently only works on boolean values
    // an elseif is used without a terminating else so that we can
    // explicitely handle the true and false cases
    // while leaving null and undefined cases alone
    if (self.get(key) === true) {
      self.set(key, false);
    } else if (self.get(key) === false) {
      self.set(key, true);
    }
    return true;
  },

  _remove: function(key) {
    var self = this;

    // making a distinction between null and undefined here

    // inspired by the following pattern seen in the Session package tinytests
    // delete Session.keys['foo']

    // might be better implemented along the lines of
    // delete self.keyValueDeps[key][serializedValue];

    self.set(key, undefined);
  },
  _setObject: function(object) {
    var self = this;

    _.each(object, function(value, key){
      if (value) {
        self.set(key, value);
      }
    });
  },

  _ensureKey: function(key) {
    var self = this;
    if (!(key in self.keyDeps)) {
      self.keyDeps[key] = new Tracker.Dependency;
      self.keyValueDeps[key] = {};
    }
  },

  // Get a JSON value that can be passed to the constructor to
  // create a new ReactiveDict with the same contents as this one
  _getMigrationData: function() {
    // XXX sanitize and make sure it's JSONible?
    return this.keys;
  }
});
