// This implementation of Min/Max-Heap is just a subclass of Max-Heap
// with a Min-Heap as an encapsulated property.
//
// Most of the operations are just proxy methods to call the same method on both
// heaps.
//
// This implementation takes 2*N memory but is fairly simple to write and
// understand. And the constant factor of a simple Heap is usually smaller
// compared to other two-way priority queues like Min/Max Heaps
// (http://www.cs.otago.ac.nz/staffpriv/mike/Papers/MinMaxHeaps/MinMaxHeaps.pdf)
// and Interval Heaps
// (http://www.cise.ufl.edu/~sahni/dsaac/enrich/c13/double.htm)
MinMaxHeap = function (comparator, options) {
  var self = this;

  MaxHeap.call(self, comparator, options);
  self._minHeap = new MaxHeap(function (a, b) {
    return -comparator(a, b);
  }, options);
};

Meteor._inherits(MinMaxHeap, MaxHeap);

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

