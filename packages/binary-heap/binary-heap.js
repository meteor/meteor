BinaryHeap = function (comparator, initData) {
  if (! _.isFunction(comparator))
    throw new Error('Passed comparator is invalid, should be a comparison function');
  var self = this;
  self._comparator = comparator;
  self._map = {};
  self._heap = [];

  if (_.isArray(initData))
    self._initFromData(initData);
};

var idStringify, idParse;
if (Package.minimongo) {
  idStringify = Package.minimongo.LocalCollection._idStringify;
  idParse = Package.minimongo.LocalCollection._idParse;
} else {
  // XXX: These can't deal with special strings like '__proto__'
  // XXX: or '{ looksLike: "object" }' or numbers.
  idStringify = function (id) { return JSON.stringify(id); };
  idParse = function (id) { return JSON.parse(id); }
}

_.extend(BinaryHeap.prototype, {
  _initFromData: function (data) {},

  get: function (id) {},
  set: function (id, value) {},
  remove: function (id) {},
  has: function (id) {},
  empty: function (id) {},
  clear: function () {},
  forEach: function (iterator) {},
  size: function () {},
  setDefault: function () {},
  clone: function () {},

  maxElementId: function () {}
});

