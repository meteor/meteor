var Component = UIComponent;

_UI.List = Component.extend({
  typeName: 'List',
  _items: null, // OrderedDict of id -> Component
  _else: null, // Component
  constructed: function () {
    this._items = new OrderedDict;
  },
  addItemBefore: function (id, comp, beforeId) {
    this._items.putBefore(id, comp, beforeId);

    if (this.stage === Component.BUILT) {
      if (this._else) {
        this._else.remove();
        this._else = null;
      }

      this.insertBefore(
        comp, beforeId ? this._items.get(beforeId) : null);
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
  render: function (buf) {
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
  render: function (buf) {
    var self = this;

    // XXX support arrays too.
    // XXX and objects.
    // For now, we assume the data is a database cursor.
    var cursor = self.data();
    if (! cursor)
      return;

    var list = new self.List({
      elseContent: self.elseContent
    });

    cursor.observe({
      _no_indices: true,
      addedAt: function (doc, i, beforeId) {
        var comp = self.content(function () {
          this.dataDep.depend();
          return this._data;
        }, {
          _data: doc,
          dataDep: new Deps.Dependency
        });
        // XXX could `before` be a falsy ID?  Technically
        // idStringify seems to allow for them -- though
        // OrderedDict won't call stringify on a falsy arg.
        list.addItemBefore(Meteor.idStringify(doc._id), comp,
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
        var comp = list.getItem(Meteor.idStringify(newDoc._id));
        comp._data = newDoc;
        comp.dataDep.changed();
      }
    });

    buf(list);
  }
});
