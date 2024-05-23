// This file defines an ordered dictionary abstraction that is useful for
// maintaining a dataset backed by observeChanges.  It supports ordering items
// by specifying the item they now come before.

// The implementation is a dictionary that contains nodes of a doubly-linked
// list as its values.

// constructs a new element struct
// next and prev are whole elements, not keys.
function element(key, value, next, prev) {
  return {
    key: key,
    value: value,
    next: next,
    prev: prev
  };
}

export class OrderedDict {
  constructor(...args) {
    this._dict = Object.create(null);
    this._first = null;
    this._last = null;
    this._size = 0;

    if (typeof args[0] === 'function') {
      this._stringify = args.shift();
    } else {
      this._stringify = function (x) { return x; };
    }

    args.forEach(kv => this.putBefore(kv[0], kv[1], null));
  }

  // the "prefix keys with a space" thing comes from here
  // https://github.com/documentcloud/underscore/issues/376#issuecomment-2815649
  _k(key) {
    return " " + this._stringify(key);
  }

  empty() {
    return !this._first;
  }

  size() {
    return this._size;
  }

  _linkEltIn(elt) {
    if (!elt.next) {
      elt.prev = this._last;
      if (this._last)
        this._last.next = elt;
      this._last = elt;
    } else {
      elt.prev = elt.next.prev;
      elt.next.prev = elt;
      if (elt.prev)
        elt.prev.next = elt;
    }
    if (this._first === null || this._first === elt.next)
      this._first = elt;
  }

  _linkEltOut(elt) {
    if (elt.next)
      elt.next.prev = elt.prev;
    if (elt.prev)
      elt.prev.next = elt.next;
    if (elt === this._last)
      this._last = elt.prev;
    if (elt === this._first)
      this._first = elt.next;
  }

  putBefore(key, item, before) {
    if (this._dict[this._k(key)])
      throw new Error("Item " + key + " already present in OrderedDict");
    var elt = before ?
      element(key, item, this._dict[this._k(before)]) :
      element(key, item, null);
    if (typeof elt.next === "undefined")
      throw new Error("could not find item to put this one before");
    this._linkEltIn(elt);
    this._dict[this._k(key)] = elt;
    this._size++;
  }

  append(key, item) {
    this.putBefore(key, item, null);
  }

  remove(key) {
    var elt = this._dict[this._k(key)];
    if (typeof elt === "undefined")
      throw new Error("Item " + key + " not present in OrderedDict");
    this._linkEltOut(elt);
    this._size--;
    delete this._dict[this._k(key)];
    return elt.value;
  }

  get(key) {
    if (this.has(key)) {
      return this._dict[this._k(key)].value;
    }
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(
      this._dict,
      this._k(key)
    );
  }

  // Iterate through the items in this dictionary in order, calling
  // iter(value, key, index) on each one.

  // Stops whenever iter returns OrderedDict.BREAK, or after the last element.
  forEach(iter, context = null) {
    var i = 0;
    var elt = this._first;
    while (elt !== null) {
      var b = iter.call(context, elt.value, elt.key, i);
      if (b === OrderedDict.BREAK) return;
      elt = elt.next;
      i++;
    }
  }

  first() {
    if (this.empty()) {
      return;
    }
    return this._first.key;
  }

  firstValue() {
    if (this.empty()) {
      return;
    }
    return this._first.value;
  }

  last() {
    if (this.empty()) {
      return;
    }
    return this._last.key;
  }

  lastValue() {
    if (this.empty()) {
      return;
    }
    return this._last.value;
  }

  prev(key) {
    if (this.has(key)) {
      var elt = this._dict[this._k(key)];
      if (elt.prev)
        return elt.prev.key;
    }
    return null;
  }

  next(key) {
    if (this.has(key)) {
      var elt = this._dict[this._k(key)];
      if (elt.next)
        return elt.next.key;
    }
    return null;
  }

  moveBefore(key, before) {
    var elt = this._dict[this._k(key)];
    var eltBefore = before ? this._dict[this._k(before)] : null;
    if (typeof elt === "undefined") {
      throw new Error("Item to move is not present");
    }
    if (typeof eltBefore === "undefined") {
      throw new Error("Could not find element to move this one before");
    }
    if (eltBefore === elt.next) // no moving necessary
      return;
    // remove from its old place
    this._linkEltOut(elt);
    // patch into its new place
    elt.next = eltBefore;
    this._linkEltIn(elt);
  }

  // Linear, sadly.
  indexOf(key) {
    var ret = null;
    this.forEach((v, k, i) => {
      if (this._k(k) === this._k(key)) {
        ret = i;
        return OrderedDict.BREAK;
      }
      return;
    });
    return ret;
  }

  _checkRep() {
    Object.keys(this._dict).forEach(k => {
      const v = this._dict[k];
      if (v.next === v) {
        throw new Error("Next is a loop");
      }
      if (v.prev === v) {
        throw new Error("Prev is a loop");
      }
    });
  }
}

OrderedDict.BREAK = {"break": true};
