MinHeap = function (comparator, options) {
  var self = this;
  MaxHeap.call(self, function (a, b) {
    return -comparator(a, b);
  }, options);
};

Meteor._inherits(MinHeap, MaxHeap);

