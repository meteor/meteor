// Constructor of Heap
// - comparator - Function - given two items returns a number
// - initData - Array - the initial data in a format:
//      Object:
//        - id - String - unique id of the item
//        - value - Any - the data value
//    the contents of initData is retained
MaxHeap = function (comparator, initData) {
  if (! _.isFunction(comparator))
    throw new Error('Passed comparator is invalid, should be a comparison function');
  var self = this;

  // a C-style comparator that is given two values and returns a number,
  // negative if the first value is less than the second, positive if the second
  // value is greater than the first and zero if they are equal.
  self._comparator = comparator;

  // _heapIdx maps an id to an index in the Heap array the corresponding value
  // is located on.
  if (Package && Package.minimongo)
    self._heapIdx = new Package.minimongo.LocalCollection._IdMap;
  else
    self._heapIdx = new IdMap;

  // The Heap data-structure implemented as a 0-based contiguous array where
  // every item on index idx is a node in a complete binary tree. Every node can
  // have leaves on indexes idx*2+1 and idx*2+2, except for the lists. Every
  // node has a parent on index (idx-1)/2;
  self._heap = [];

  // If the initial array is passed, we can build the heap in linear time
  // complexity (O(N)) compared to linearithmetic time complexity (O(nlogn)) if
  // we push elements one by one.
  if (_.isArray(initData))
    self._initFromData(initData);
};

_.extend(MaxHeap.prototype, {
  // Builds a new heap in-place in linear time based on passed data
  _initFromData: function (data) {
    var self = this;

    self._heap = _.map(data, function (o) {
      return { id: EJSON.clone(o.id), value: o.value };
    });

    _.each(data, function (o, i) {
      self._heapIdx.set(o.id, i);
    });

    for (var i = parentIdx(data.length); i >= 0; i--)
      self._downHeap(i);
  },

  _downHeap: function (idx) {
    var self = this;

    while (leftChildIdx(idx) < self.size()) {
      var left = leftChildIdx(idx);
      var right = rightChildIdx(idx);
      var largest = idx;

      if (left < self.size() &&
          self._comparator(self._get(left), self._get(largest)) > 0) {
        largest = left;
      }
      if (right < self.size() &&
          self._comparator(self._get(right), self._get(largest)) > 0) {
        largest = right;
      }

      if (largest === idx)
        break;

      self._swap(largest, idx);
      idx = largest;
    }
  },

  _upHeap: function (idx) {
    var self = this;
    var value = self._get(idx);

    while (idx > 0) {
      var parent = parentIdx(idx);
      if (self._comparator(self._get(parent), value) < 0) {
        self._swap(parent, idx)
        idx = parent;
      } else {
        break;
      }
    }
  },

  // Internal: gets raw data object placed on idxth place in heap
  _get: function (idx) {
    var self = this;
    return self._heap[idx].value;
  },

  _swap: function (idxA, idxB) {
    var self = this;
    var A = self._heap[idxA];
    var B = self._heap[idxB];

    self._heapIdx.set(A.id, idxB);
    self._heapIdx.set(B.id, idxA);

    self._heap[idxA] = B;
    self._heap[idxB] = A;
  },

  get: function (id) {
    var self = this;
    if (! self.has(id))
      return null;
    return self._get(self._heapIdx.get(id));
  },
  set: function (id, value) {
    var self = this;

    if (self.has(id)) {
      if (self.get(id) === value)
        return;
      else
        self.remove(id);
    }

    self._heapIdx.set(id, self._heap.length);
    self._heap.push({ id: id, value: value });
    self._upHeap(self._heap.length - 1);
  },
  remove: function (id) {
    var self = this;

    if (self.has(id)) {
      var last = self._heap.length - 1;
      var idx = self._heapIdx.get(id);

      if (idx !== last) {
        self._swap(idx, last);
        self._heap.pop();
        self._downHeap(idx);
      } else {
        self._heap.pop();
      }

      self._heapIdx.remove(id);
    }
  },
  has: function (id) {
    var self = this;
    return self._heapIdx.has(id);
  },
  empty: function (id) {
    var self = this;
    return !self.size();
  },
  clear: function () {
    var self = this;
    self._heap = [];
    self._heapIdx.clear();
  },
  forEach: function (iterator) {
    var self = this;
    _.each(self._heap, function (obj) {
      return iterator(obj.value, obj.id);
    });
  },
  size: function () {
    var self = this;
    return self._heap.length;
  },
  setDefault: function (id, def) {
    var self = this;
    if (self.has(id))
      return self.get(id);
    self.set(id, def);
    return def;
  },
  clone: function () {
    var self = this;
    var clone = new MaxHeap(self._comparator);
    clone._heap = EJSON.clone(self._heap);
    clone._heapIdx = self._heapIdx.clone();
    return clone;
  },

  maxElementId: function () {
    var self = this;
    return self.size() ? self._heap[0].id : null;
  }
});

function leftChildIdx (i) { return i * 2 + 1; }
function rightChildIdx (i) { return i * 2 + 2; }
function parentIdx (i) { return (i - 1) >> 1; }

