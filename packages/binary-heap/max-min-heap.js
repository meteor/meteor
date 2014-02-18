MaxMinHeap = function (comparator, initialData) {
  var self = this;

  BinaryHeap.call(self, comparator, initialData);
  self._minHeap = new BinaryHeap(function (a, b) {
    return -comparator(a, b);
  }, initialData);
};

MaxMinHeap.prototype = Object.create(BinaryHeap.prototype);

_.extend(MaxMinHeap.prototype, {
  set: function (id, value) {
    var self = this;
    self._minHeap.set(id, value);
    BinaryHeap.prototype.set.apply(self, arguments);
  },
  remove: function (id) {
    var self = this;
    self._minHeap.remove(id);
    BinaryHeap.prototype.remove.apply(self, arguments);
  },
  clear: function () {
    var self = this;
    self._minHeap.clear(id);
    BinaryHeap.prototype.clear.apply(self, arguments);
  },
  setDefault: function (id, def) {
    var self = this;
    self._minHeap.setDefault(id, def);
    return BinaryHeap.prototype.setDefault.apply(self, arguments);
  },
  clone: function () {
    var self = this;
    var clone = new MaxMinHeap(self._comparator);
    clone._heap = EJSON.clone(self._heap);
    clone._heapIdx = EJSON.clone(self._heapIdx);
    clone._minHeap = self._minHeap.clone();
    return clone;
  },
  minElementId: function () {
    var self = this;
    return self._minHeap.maxElementId();
  }
});

