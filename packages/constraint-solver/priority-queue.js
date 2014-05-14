PriorityQueue = function () {
  var self = this;
  var compareArrays = function (a, b) {
    for (var i = 0; i < a.length; i++)
      if (a[i] !== b[i])
        if (a[i] instanceof Array)
          return compareArrays(a[i], b[i]);
        else
          return a[i] - b[i];

    return 0;
  };
  // id -> cost
  self._heap = new MinHeap(function (a, b) {
    return compareArrays(a, b);
  });

  // id -> reference to item
  self._items = {};
};

_.extend(PriorityQueue.prototype, {
  push: function (item, cost) {
    var self = this;
    var id = Random.id();
    self._heap.set(id, cost);
    self._items[id] = item;
  },
  top: function () {
    var self = this;
    var id = self._heap.minElementId();
    return self._items[id];
  },
  pop: function () {
    var self = this;
    var id = self._heap.minElementId();
    var item = self._items[id];

    delete self._items[id];
    self._heap.remove(id);

    return item;
  },
  empty: function () {
    var self = this;
    return self._heap.empty();
  },
  size: function () {
    var self = this;
    return self._heap.size();
  }
});


