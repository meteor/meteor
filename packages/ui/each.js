
// `id` arguments to this class MUST be non-empty strings
UI.List = Component.extend({
  typeName: 'List',
  _items: null, // OrderedDict of id -> Component
  _else: null, // Component
  constructed: function () {
    this._items = new OrderedDict;
  },
  addItemBefore: function (id, compType, data, beforeId) {
    var self = this;

    var comp = compType(function () {
      this.dataDep.depend();
      return this._data;
    }, {
      _data: data,
      dataDep: new Deps.Dependency
    });
    self._items.putBefore(id, comp, beforeId);

    if (self.stage === Component.BUILT) {
      if (self._else) {
        self._else.remove();
        self._else = null;
      }

      self.insertBefore(
        comp, beforeId ? self._items.get(beforeId) : null);
    }
  },
  removeItem: function (id) {
    var comp = this._items.remove(id);

    if (this.stage === Component.BUILT) {
      comp.remove();
      if (this._items.empty()) {
        this._else = this.elseContent();
        if (this._else)
          this.append(this._else);
      }
    }
  },
  moveItemBefore: function (id, beforeId) {
    var comp = this._items.get(id);
    this._items.moveBefore(id, beforeId);

    if (this.stage === Component.BUILT) {
      comp.detach();
      this.insertBefore(
        comp, beforeId ? this._items.get(beforeId) : null);
    }
  },
  getItem: function (id) {
    return this._items.get(id) || null;
  },
  setItemData: function (id, newData) {
    var comp = this.getItem(id);
    if (! comp)
      throw new Error("No such item: " + id);
    // Do a `===` check even though it's weak
    if (newData !== comp._data) {
      comp._data = newData;
      comp.dataDep.changed();
    }
  },
  numItems: function () {
    return this._items.size();
  },
  render: function (buf) {
    // This component reactively rebuilds when any dependencies
    // here are invalidated.
    //
    // The "item" methods cannot be called from here; they assume
    // they are not operating during the build, but either
    // before or after it.

    var self = this;
    if (self._items.empty()) {
      buf(self._else = self.elseContent());
    } else {
      self._items.forEach(function (comp) {
        buf(comp);
      });
    }
  },
  // Optimize the calculation of the new `.start` and `.end`
  // after removing child components at the start or end.
  _findStartComponent: function () {
    return this._items.firstValue();
  },
  _findEndComponent: function () {
    return this._items.lastValue();
  },
  // Replace the data in this list with a different dataset,
  // reusing components with matching ids, moving them if
  // necessary.
  // The caller supplies a sequence of (id, data) : (String, any)
  // pairs using the `add` method of the returned object, and then
  // calls `end`.
  beginReplace: function () {
    var self = this;

    var items = self._items;
    var ptr = items.first();
    var seenIds = {};
    var counter = 1;
    // uniquify IDs by adding a few random characters and
    // a counter.
    var rand = Random.id().slice(0,4);
    return {
      // here only, id may be null
      add: function (id, compType, data) {
        var origId = id;
        while ((! id) || seenIds.hasOwnProperty(id))
          id = (origId || '') + rand + (counter++);
        seenIds[id] = true;

        // Now we know `id` is unique among new items,
        // but it may match an old item at or after
        // the location of `ptr`.
        //
        // We use the strategy of moving an existing component
        // into the appropriate place if one exists, otherwise
        // inserting one.  This is efficient if, say, a new document
        // is inserted at the top or bottom, removed from the bottom,
        // or moved to the top.  It's inefficient if a document is
        // removed from the top or moved to the bottom, because we
        // will perform `N-1` "moves".
        //
        // In summary, we don't generate efficient moves the way
        // least-common-subsequence would, be we do reuse existing
        // components and move them to the right place.
        if (ptr === id) {
          // XXX we don't deal the case where compType is different
          // from the original compType.
          self.setItemData(id, data);
          ptr = items.next(ptr);
        } else if (items.has(id)) {
          self.moveItemBefore(id, ptr);
          self.setItemData(id, data);
        } else {
          self.addItemBefore(id, compType, data, ptr);
        }
      },
      end: function () {
        // delete everything at or after ptr
        while (ptr) {
          var next = items.next(ptr);
          self.removeItem(ptr);
          ptr = next;
        }
      }
    };
  }
});

UI.Each = Component.extend({
  typeName: 'Each',
  List: UI.List,
  _oldData: null,
  init: function () {
    var self = this;
    self._list = self.List({
      elseContent: function (/**/) {
        return self.elseContent.apply(self, arguments);
      }
    });
    // add outside of the rebuild cycle
    self.add(self._list);
  },
  _getId: function (value) { // override this
    if (value == null) {
      return null;
    } else if (value._id == null) {
      if (typeof value === 'object')
        // value is some object without `_id`.  oh well.
        return null;
      else
        // value is a string or number, say
        return String(value);
    } else {
      if (typeof value._id === 'object')
        return null;
      else
        return String(value._id);
    }
  },
  render: function (buf) {
    var self = this;
    var list = self._list;

    var newData = self.data();
    // Do a `===` check even though it's weak
    if (newData !== self._oldData) {
      self._oldData = newData;

      var replacer = list.beginReplace();

      if (! newData) {
        // nothing to do
      } else if (typeof newData.length === 'number' &&
                 typeof newData.splice === 'function') {
        // looks like an array
        var array = newData;

        for (var i=0, N=array.length; i<N; i++) {
          var x = array[i];
          replacer.add(self._getId(x), self.content, x);
        }

      } else if (newData.observe) {
        var cursor = newData;

        // we assume that `observe` will only call `addedAt` (and
        // not other callbacks) before returning (which is specced),
        // and further that these calls will be in document order
        // (which isn't).
        cursor.observe({
          _no_indices: true,
          addedAt: function (doc, i, beforeId) {
            var id = Meteor.idStringify(doc._id);
            if (replacer)
              replacer.add(id, self.content, doc);
            else
              list.addItemBefore(id, self.content, doc,
                                 beforeId && Meteor.idStringify(beforeId));
          },
          removed: function (doc) {
            list.removeItem(Meteor.idStringify(doc._id));
          },
          movedTo: function (doc, i, j, beforeId) {
            list.moveItemBefore(Meteor.idStringify(doc._id),
                                beforeId && Meteor.idStringify(beforeId));
          },
          changed: function (newDoc) {
            list.setItemData(Meteor.idStringify(newDoc._id), newDoc);
          }
        });
      } else {
        for (var k in newData)
          replacer.add(k, self.content, newData[k]);
      }

      replacer.end();
      replacer = null; // so cursor.observe callbacks stop using it
    }

    buf(list);
  }
});
