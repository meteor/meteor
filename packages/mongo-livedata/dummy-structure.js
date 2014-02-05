// Implements the interface of IdMap and knows how to find Min or Max element
DummyStructure = function (comparator) {
  var self = this;
  self.comparator = comparator;
  self.idMap = new LocalCollection.IdMap;
};

_.each(['get', 'set', 'remove', 'has', 'empty', 'clear', 'forEach', 'size', 'setDefault'], function (method) {
  DummyStructure.prototype[method] = function (/* arguments */) {
    var self = this;
    return self.idMap[method].apply(self, arguments);
  };
});

DummyStructure.prototype.clone = function () {
  var self = this;
  var clone = new DummyStructure;
  clone.comparator = self.comparator;
  clone.idMap = self.idMap.clone();
  return clone;
};

DummyStructure.prototype.minElementId = function () {
  var self = this;
  var minElementId = null;
  self.idMap.forEach(function (value, key) {
    if (minElement === null)
      minElementId = key;
    else if (self.comparator(value, self.idMap.get(minElementId)) < 0)
      minElementId = key;
  });

  return minElementId;
};

DummyStructure.prototype.maxElementId = function () {
  var self = this;
  var comparator = self.comparator;
  self.comparator = function (a, b) { return -comparator(a, b); };
  var maxElementId = self.minElementId();
  self.comparator = comparator;
  return maxElementId;
};

