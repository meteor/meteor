(function () {
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
    _.each(arguments, function (kv) {
      self.putBefore(kv[0], kv[1], null);
    });
  };

  _.extend(OrderedDict.prototype, {
    putBefore: function (key, item, before) {
      var self = this;
      var elt = before ?
            element(key, item, self._dict[before]) :
            element(key, item, null);
      if (elt.next === undefined)
        throw new Error("could not find item to put this one before");
      if (!elt.next) {
        elt.prev = self._last;
        self._last.next = elt;
        self._last = elt;
      } else {
        elt.prev = elt.next.prev;
        elt.next.prev = elt;
        elt.prev.next = elt;
      }
      if (self._first === null || self._first === elt.next)
        self._first = elt;
    },
    remove: function (key) {
      var self = this;
      var elt = self._dict[key];
      if (elt !== undefined) {
        elt.next.prev = elt.prev;
        elt.prev.next = elt.next;
        if (elt === self._last)
          self._last = elt.prev;
        if (elt === self._first)
          self._first = elt.next;
        delete self._dict[key];
        return elt.value;
      } else {
        return undefined;
      }
    },
    get: function (key) {
      var self = this;
      if (_.has(self._dict, key))
          return self._dict[key].value;
      return undefined;
    },
    has: function (key) {
      var self = this;
      return _.has(self._dict[key]);
    },
    each: function (iter) {
      var self = this;
      var i = 0;
      var elt = self._first;
      while (elt !== null) {
        var b = iter(elt.value, elt.key, i);
        if (b === OrderedDict.BREAK)
          return;
        elt = elt.next;
      }
    },
    first: function () {
      var self = this;
      return self._first.key;
    },
    firstValue: function () {
      var self = this;
      return self._first.value;
    },
    last: function () {
      var self = this;
      return self._last.key;
    },
    lastValue: function () {
      var self = this;
      return self._last.value;
    },
    prev: function (key) {
      var self = this;
      if (_.has(self._dict, key)) {
        var elt = self._dict[key];
        if (elt.prev)
          return elt.prev.key;
      }
      return null;
    },
    next: function (key) {
      var self = this;
      if (_.has(self._dict, key)) {
        var elt = self._dict[key];
        if (elt.next)
          return elt.next.key;
      }
      return null;
    },
    moveBefore: function (key, before) {
      var self = this;
      var elt = self._dict[key];
      var eltBefore = before ? self._dict[before] : null;
      if (elt === undefined)
        throw new Error("Item to move is not present");
      if (eltBefore === undefined)
        throw new Error("Could not find element to move this one before");
      if (eltBefore === elt.next) // no moving necessary.
        return;
      // remove from its old place
      elt.next.prev = elt.prev;
      elt.prev.next = elt.next;
      if (elt === self._last)
        self._last = elt.prev;
      if (elt === self._first)
        self._first = elt.next;

      // now patch it in to its new place
      if (eltBefore === null) {
        elt.next = null;
        elt.prev = self._last;
        self._last.next = elt.prev;
        self._last = elt;
      } else {
        elt.next = eltBefore;
        elt.prev = eltBefore.prev;
        eltBefore.prev = elt;
        elt.prev.next = elt;
      }

    },
    getIndex: function (key) {
      var self = this;
      var ret = null;
      self.each(function (v, k, i) {
        if (k === key) {
          ret = i;
          return OrderedDict.BREAK;
        }
        return undefined;
      });
      return ret;
    }
  });

OrderedDict.BREAK = {break: true};
})();
