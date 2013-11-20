LocalCollection._IdMap = function () {
  var self = this;
  self._map = {};
};

_.extend(LocalCollection._IdMap.prototype, {
  get: function (id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    return self._map[key];
  },
  set: function (id, value) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    self._map[key] = value;
  },
  remove: function (id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    delete self._map[key];
  },
  has: function (id) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    return _.has(self._map, key);
  },
  isEmpty: function () {
    var self = this;
    return _.isEmpty(self._map);
  },
  clear: function () {
    var self = this;
    self._map = {};
  },
  each: function (iterator) {
    var self = this;
    _.each(self._map, function (value, key, obj) {
      var context = this;
      iterator.call(context, value, LocalCollection._idParse(key), obj);
    });
  },
  // XXX used?
  setDefault: function (id, def) {
    var self = this;
    var key = LocalCollection._idStringify(id);
    if (_.has(self._map, key))
      return self._map[key];
    self._map[key] = def;
    return def;
  }
});
