// This file defines an ordered dictionary abstraction that is useful for
// maintaining a dataset backed by observeChanges.  It supports ordering items
// by specifying the item they now come before.

// The implementation is a dictionary that contains nodes of a doubly-linked
// list as its values.

// constructs a new element struct
// next and prev are whole elements, not keys.
var element = function (key, value, next, prev) {
  return {
    key: key,
    value: value,
    next: next,
    prev: prev
  };
};
OrderedDict = function (/* ... */) {
  var self = this;
  self._dict = {};
  self._first = null;
  self._last = null;
  self._size = 0;
  var args = _.toArray(arguments);
  self._stringify = function (x) { return x; };
  if (typeof args[0] === 'function')
    self._stringify = args.shift();
  _.each(args, function (kv) {
    self.putBefore(kv[0], kv[1], null);
  });
};

_.extend(OrderedDict.prototype, {
  // the "prefix keys with a space" thing comes from here
  // https://github.com/documentcloud/underscore/issues/376#issuecomment-2815649
  _k: function (key) { return " " + this._stringify(key); },

  empty: function () {
    var self = this;
    return !self._first;
  },
  size: function () {
    var self = this;
    return self._size;
  },
  _linkEltIn: function (elt) {
    var self = this;
    if (!elt.next) {
      elt.prev = self._last;
      if (self._last)
        self._last.next = elt;
      self._last = elt;
    } else {
      elt.prev = elt.next.prev;
      elt.next.prev = elt;
      if (elt.prev)
        elt.prev.next = elt;
    }
    if (self._first === null || self._first === elt.next)
      self._first = elt;
  },
  _linkEltOut: function (elt) {
    var self = this;
    if (elt.next)
      elt.next.prev = elt.prev;
    if (elt.prev)
      elt.prev.next = elt.next;
    if (elt === self._last)
      self._last = elt.prev;
    if (elt === self._first)
      self._first = elt.next;
  },
  putBefore: function (key, item, before) {
    var self = this;
    if (self._dict[self._k(key)])
      throw new Error("Item " + key + " already present in OrderedDict");
    var elt = before ?
          element(key, item, self._dict[self._k(before)]) :
          element(key, item, null);
    if (elt.next === undefined)
      throw new Error("could not find item to put this one before");
    self._linkEltIn(elt);
    self._dict[self._k(key)] = elt;
    self._size++;
  },
  append: function (key, item) {
    var self = this;
    self.putBefore(key, item, null);
  },
  remove: function (key) {
    var self = this;
    var elt = self._dict[self._k(key)];
    if (elt === undefined)
      throw new Error("Item " + key + " not present in OrderedDict");
    self._linkEltOut(elt);
    self._size--;
    delete self._dict[self._k(key)];
    return elt.value;
  },
  get: function (key) {
    var self = this;
    if (self.has(key))
        return self._dict[self._k(key)].value;
    return undefined;
  },
  has: function (key) {
    var self = this;
    return _.has(self._dict, self._k(key));
  },
  // Iterate through the items in this dictionary in order, calling
  // iter(value, key, index) on each one.

  // Stops whenever iter returns OrderedDict.BREAK, or after the last element.
  forEach: function (iter) {
    var self = this;
    var i = 0;
    var elt = self._first;
    while (elt !== null) {
      var b = iter(elt.value, elt.key, i);
      if (b === OrderedDict.BREAK)
        return;
      elt = elt.next;
      i++;
    }
  },
  first: function () {
    var self = this;
    if (self.empty())
      return undefined;
    return self._first.key;
  },
  firstValue: function () {
    var self = this;
    if (self.empty())
      return undefined;
    return self._first.value;
  },
  last: function () {
    var self = this;
    if (self.empty())
      return undefined;
    return self._last.key;
  },
  lastValue: function () {
    var self = this;
    if (self.empty())
      return undefined;
    return self._last.value;
  },
  prev: function (key) {
    var self = this;
    if (self.has(key)) {
      var elt = self._dict[self._k(key)];
      if (elt.prev)
        return elt.prev.key;
    }
    return null;
  },
  next: function (key) {
    var self = this;
    if (self.has(key)) {
      var elt = self._dict[self._k(key)];
      if (elt.next)
        return elt.next.key;
    }
    return null;
  },
  moveBefore: function (key, before) {
    var self = this;
    var elt = self._dict[self._k(key)];
    var eltBefore = before ? self._dict[self._k(before)] : null;
    if (elt === undefined)
      throw new Error("Item to move is not present");
    if (eltBefore === undefined) {
      throw new Error("Could not find element to move this one before");
    }
    if (eltBefore === elt.next) // no moving necessary
      return;
    // remove from its old place
    self._linkEltOut(elt);
    // patch into its new place
    elt.next = eltBefore;
    self._linkEltIn(elt);
  },
  // Linear, sadly.
  indexOf: function (key) {
    var self = this;
    var ret = null;
    self.forEach(function (v, k, i) {
      if (self._k(k) === self._k(key)) {
        ret = i;
        return OrderedDict.BREAK;
      }
      return undefined;
    });
    return ret;
  },
  _checkRep: function () {
    var self = this;
    _.each(self._dict, function (k, v) {
      if (v.next === v)
        throw new Error("Next is a loop");
      if (v.prev === v)
        throw new Error("Prev is a loop");
    });
  }

});
OrderedDict.BREAK = {"break": true};
