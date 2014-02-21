MinMaxHeap = function (comparator, initialData) {
  var self = this;

  MaxHeap.call(self, comparator, initialData);
  self._minHeap = new MaxHeap(function (a, b) {
    return -comparator(a, b);
  }, initialData);
};

var F = function () {};
F.prototype = MaxHeap.prototype;
MinMaxHeap.prototype = new F;

_.extend(MinMaxHeap.prototype, {
  set: function (id, value) {
    var self = this;
    MaxHeap.prototype.set.apply(self, arguments);
    self._minHeap.set(id, value);
  },
  remove: function (id) {
    var self = this;
    MaxHeap.prototype.remove.apply(self, arguments);
    self._minHeap.remove(id);
  },
  clear: function () {
    var self = this;
    MaxHeap.prototype.clear.apply(self, arguments);
    self._minHeap.clear();
  },
  setDefault: function (id, def) {
    var self = this;
    MaxHeap.prototype.setDefault.apply(self, arguments);
    return self._minHeap.setDefault(id, def);
  },
  clone: function () {
    var self = this;
    var clone = new MinMaxHeap(self._comparator, self._heap);
    return clone;
  },
  minElementId: function () {
    var self = this;
    return self._minHeap.maxElementId();
  }
});

