// Helper function to call changed on a key that might not exist
changed = function (v) {
  if (v) {
    v.changed();
  }
};

ReactiveDict = function (dictName) {
  // this.keys: key -> value
  if (dictName) {
    return new SerializingReactiveDict(dictName);
  }

  // Actual data storage
  this.keys = {};

  // Used for .get to fire a change when the value changes
  this.keyDeps = {};

  // Used for .clear and .all
  this.allDeps = new Tracker.Dependency();

  // Save the result of converting an undefined
  this._identity = this._convert(undefined);
};

_.extend(ReactiveDict.prototype, {
  /**
   * Convert incoming values to a desired representation for internal storage
   * @param  {Object} value Anything the user puts in
   * @return {Object}       The object that will be stored in the internal
   * data structure of the ReactiveDict
   */
  _convert: function (value) {
    // No-op in the base class, override this to modify incoming values, for
    // example to serialize them
    return value;
  },

  // The opposite of _convert
  _unConvert: function (convertedValue) {
    return convertedValue;
  },

  /**
   * Compare two internally stored values
   * @param  {Object} l A value of the form returned by _convert
   * @param  {Object} r A value of the form returned by _convert
   * @return {Boolean} True if the items should be considered equal 
   */
  _equals: function (l, r) {
    return _.isEqual(l, r);
  },

  /**
   * Set a value
   * @param {String} key   The key
   * @param {Object} value Any value
   */
  set: function (keyOrObject, value) {
    var self = this;

    if ((typeof keyOrObject === 'object') && (value === undefined)) {
      self._setObject(keyOrObject);
      return;
    }
    // the input isn't an object, so it must be a key
    // and we resume with the rest of the function
    var key = keyOrObject;

    value = self._convert(value);

    var oldValue = self._identity;
    if (_.has(self.keys, key)) {
      oldValue = self.keys[key];
    }

    if (self._equals(value, oldValue)) {
      // Do nothing, the set has no effect
      return;
    }

    self.keys[key] = value;

    self.allDeps.changed();
    changed(self.keyDeps[key]);
  },

  _setObject: function (object) {
    var self = this;

    _.each(object, function (value, key){
      self.set(key, value);
    });
  },

  setDefault: function (key, value) {
    var self = this;

    // for now, explicitly check for undefined, since there is no
    // ReactiveDict.clear().  Later we might have a ReactiveDict.clear(), in which case
    // we should check if it has the key.
    if (self.keys[key] === undefined) {
      self.set(key, value);
    }
  },

  get: function (key) {
    var self = this;
    self._ensureKey(key);
    self.keyDeps[key].depend();
    return self._unConvert(self.keys[key]);
  },

  equals: function (key, value) {
    // In the base class, there is no efficient way to do .equals, so we only do
    // it in the serializing variants
    throw new Error(".equals is not implemented on this object.");
  },

  _ensureKey: function (key) {
    var self = this;
    if (!(key in self.keyDeps)) {
      self.keyDeps[key] = new Tracker.Dependency();
    }
  },

  /**
   * Return all of the keys/values of the ReactiveDict as a plain object, and
   * register a dependency on any changes to the dictionary.
   */
  all: function () {
    var self = this;

    self.allDeps.depend();

    var unConverted = {};
    _.each(self.keys, function (value, key) {
      unConverted[key] = self._unConvert(value);
    });

    return unConverted;
  },

  clear: function () {
    var self = this;

    _.each(self.keys, function (value, key) {
      self.set(key, undefined);
    });

    self.keys = {};
  }
});