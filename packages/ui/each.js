var Component = UIComponent;

_UI.List = Component.extend({
  typeName: 'List',
  isHeavyweight: true,
  _idStringify: null,
  constructed: function () {
    this._items = new OrderedDict(
      this._idStringify || function (x) { return x; });
  },
  addItemBefore: function (id, comp, beforeId) {
    this._items.putBefore(id, comp, beforeId);

    if (this.stage === Component.BUILT)
      // XXX clean this up by making insertBefore work with two nulls
      this.insertBefore(comp, beforeId ? this._items.get(beforeId) :
                        this.lastNode().nextSibling, this.parentNode());
  },
  removeItem: function (id) {
    var comp = this._items.remove(id);

    if (this.stage === Component.BUILT)
      comp.remove();
  },
  moveItemBefore: function (id, beforeId) {
    var comp = this._items.get(id);
    this._items.moveBefore(id, beforeId);

    if (this.stage === Component.BUILT) {
      comp.detach();
      this.insertBefore(comp, beforeId ? this._items.get(beforeId) :
                        this.lastNode().nextSibling, this.parentNode());
    }
  },
  render: function (buf) {
    var self = this;
    self._items.forEach(function (comp) {
      buf(comp);
    });
  }
});

_UI.Each = Component.extend({
  typeName: 'Each',
  render: function (buf) {
    var self = this;

    // XXX support arrays too.
    // XXX and objects.
    // For now, we assume the data is a database cursor.
    var cursor = self.data();
    // XXX support null

    // id -> component
    var items = self.items = new OrderedDict(Meteor.idStringify);

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
        items.putBefore(doc._id, comp, beforeId);

      }
    });

    if (items.empty()) {
      buf(self.elseContent());
    } else {
      items.forEach(function (comp) {
        buf(comp);
      });
    }
  }
});
