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
    BinaryHeap.prototype.set.apply(self, arguments);
    self._minHeap.set(id, value);
  },
  remove: function (id) {
    var self = this;
    BinaryHeap.prototype.remove.apply(self, arguments);
    self._minHeap.remove(id);
  },
  clear: function () {
    var self = this;
    BinaryHeap.prototype.clear.apply(self, arguments);
    self._minHeap.clear();
  },
  setDefault: function (id, def) {
    var self = this;
    BinaryHeap.prototype.setDefault.apply(self, arguments);
    return self._minHeap.setDefault(id, def);
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

