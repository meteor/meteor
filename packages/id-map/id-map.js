IdMap = function (idStringify, idParse) {
  var self = this;
  self._map = {};
  self._idStringify = idStringify || JSON.stringify;
  self._idParse = idParse || JSON.parse;
};

// Some of these methods are designed to match methods on OrderedDict, since
// (eg) ObserveMultiplex and _CachingChangeObserver use them interchangeably.
// (Conceivably, this should be replaced with "UnorderedDict" with a specific
// set of methods that overlap between the two.)

_.extend(IdMap.prototype, {
  get: function (id) {
    var self = this;
    var key = self._idStringify(id);
    return self._map[key];
  },
  set: function (id, value) {
    var self = this;
    var key = self._idStringify(id);
    self._map[key] = value;
  },
  remove: function (id) {
    var self = this;
    var key = self._idStringify(id);
    delete self._map[key];
  },
  has: function (id) {
    var self = this;
    var key = self._idStringify(id);
    return _.has(self._map, key);
  },
  empty: function () {
    var self = this;
    return _.isEmpty(self._map);
  },
  clear: function () {
    var self = this;
    self._map = {};
  },
  // Iterates over the items in the map. Return `false` to break the loop.
  forEach: function (iterator) {
    var self = this;
    // don't use _.each, because we can't break out of it.
    var keys = _.keys(self._map);
    for (var i = 0; i < keys.length; i++) {
      var breakIfFalse = iterator.call(null, self._map[keys[i]],
                                       self._idParse(keys[i]));
      if (breakIfFalse === false)
        return;
    }
  },
  size: function () {
    var self = this;
    return _.size(self._map);
  },
  setDefault: function (id, def) {
    var self = this;
    var key = self._idStringify(id);
    if (_.has(self._map, key))
      return self._map[key];
    self._map[key] = def;
    return def;
  },
  // Assumes that values are EJSON-cloneable, and that we don't need to clone
  // IDs (ie, that nobody is going to mutate an ObjectId).
  clone: function () {
    var self = this;
    var clone = new IdMap(self._idStringify, self._idParse);
    self.forEach(function (value, id) {
      clone.set(id, EJSON.clone(value));
    });
    return clone;
  }
});

