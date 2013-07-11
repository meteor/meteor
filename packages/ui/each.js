var Component = UIComponent;

_UI.List = Component.extend({
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
  _findStartComponent: function () {
    return this._items.firstValue();
  },
  _findEndComponent: function () {
    return this._items.lastValue();
  }
});

_UI.Each = Component.extend({
  typeName: 'Each',
  List: _UI.List,
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
  render: function (buf) {
    var self = this;
    var list = self._list;

    // XXX support arrays too.
    // XXX and objects.
    // For now, we assume the data is a database cursor.
    var newData = self.data();
    // Do a `===` check even though it's weak
    if (newData !== self._oldData) {
      self._oldData = newData;

      if (newData && newData.observe) {
        var cursor = newData;

        cursor.observe({
          _no_indices: true,
          addedAt: function (doc, i, beforeId) {
            list.addItemBefore(Meteor.idStringify(doc._id),
                               self.content, doc,
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
      }
    }
    // XXX we fail on switching to empty; should use
    // patching replace for that.

    buf(list);
  }
});
