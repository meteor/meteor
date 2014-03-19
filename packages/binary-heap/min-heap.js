MinHeap = function (comparator, options) {
  var self = this;
  MaxHeap.call(self, function (a, b) {
    return -comparator(a, b);
  }, options);
};

Meteor._inherits(MinHeap, MaxHeap);

_.extend(MinHeap.prototype, {
  maxElementId: function () {
    throw new Error("Cannot call maxElementId on MinHeap");
  },
  minElementId: function () {
    var self = this;
    return MaxHeap.prototype.maxElementId.call(self);
  }
});

