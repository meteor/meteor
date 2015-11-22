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

var changed = function (v) {
  v && v.changed();
};

// XXX COMPAT WITH 0.9.1 : accept migrationData instead of dictName
ReactiveDict = function (dictName) {
  // this.keys: key -> value
  if (dictName) {
    if (typeof dictName === 'string') {
      // the normal case, argument is a string name.
      // _registerDictForMigrate will throw an error on duplicate name.
      ReactiveDict._registerDictForMigrate(dictName, this);
      this.keys = ReactiveDict._loadMigratedDict(dictName) || {};
      this.name = dictName;
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

  this.allDeps = new Tracker.Dependency;
  this.keyDeps = {}; // key -> Dependency
  this.keyValueDeps = {}; // key -> Dependency
};

_.extend(ReactiveDict.prototype, {
  // set() began as a key/value method, but we are now overloading it
  // to take an object of key/value pairs, similar to backbone
  // http://backbonejs.org/#Model-set

  set: function (keyOrObject, value) {
    var self = this;

    if ((typeof keyOrObject === 'object') && (value === undefined)) {
      // Called as `dict.set({...})`
      self._setObject(keyOrObject);
      return;
    }
    // the input isn't an object, so it must be a key
    // and we resume with the rest of the function
    var key = keyOrObject;

    value = stringify(value);

    var keyExisted = _.has(self.keys, key);
    var oldSerializedValue = keyExisted ? self.keys[key] : 'undefined';
    var isNewValue = (value !== oldSerializedValue);

    self.keys[key] = value;

    if (isNewValue || !keyExisted) {
      self.allDeps.changed();
    }

    if (isNewValue) {
      changed(self.keyDeps[key]);
      if (self.keyValueDeps[key]) {
        changed(self.keyValueDeps[key][oldSerializedValue]);
        changed(self.keyValueDeps[key][value]);
      }
    }
  },

  setDefault: function (key, value) {
    var self = this;
    if (! _.has(self.keys, key)) {
      self.set(key, value);
    }
  },

  get: function (key) {
    var self = this;
    self._ensureKey(key);
    self.keyDeps[key].depend();
    return parse(self.keys[key]);
  },

  equals: function (key, value) {
    var self = this;

    // Mongo.ObjectID is in the 'mongo' package
    var ObjectID = null;
    if (Package.mongo) {
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
        value !== null) {
      throw new Error("ReactiveDict.equals: value must be scalar");
    }
    var serializedValue = stringify(value);

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
    if (_.has(self.keys, key)) oldValue = parse(self.keys[key]);
    return EJSON.equals(oldValue, value);
  },

  all: function() {
    this.allDeps.depend();
    var ret = {};
    _.each(this.keys, function(value, key) {
      ret[key] = parse(value);
    });
    return ret;
  },

  clear: function() {
    var self = this;

    var oldKeys = self.keys;
    self.keys = {};

    self.allDeps.changed();

    _.each(oldKeys, function(value, key) {
      changed(self.keyDeps[key]);
      if (self.keyValueDeps[key]) {
        changed(self.keyValueDeps[key][value]);
        changed(self.keyValueDeps[key]['undefined']);
      }
    });

  },

  delete: function(key) {
    var self = this;
    var didRemove = false;

    if (_.has(self.keys, key)) {
      var oldValue = self.keys[key];
      delete self.keys[key];
      changed(self.keyDeps[key]);
      if (self.keyValueDeps[key]) {
        changed(self.keyValueDeps[key][oldValue]);
        changed(self.keyValueDeps[key]['undefined']);
      }
      self.allDeps.changed();
      didRemove = true;
    }

    return didRemove;
  },

  _setObject: function (object) {
    var self = this;

    _.each(object, function (value, key){
      self.set(key, value);
    });
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.keyDeps)) {
      self.keyDeps[key] = new Tracker.Dependency;
      self.keyValueDeps[key] = {};
    }
  },

  // Get a JSON value that can be passed to the constructor to
  // create a new ReactiveDict with the same contents as this one
  _getMigrationData: function () {
    // XXX sanitize and make sure it's JSONible?
    return this.keys;
  }
});
