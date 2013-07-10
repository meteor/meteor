var Component = UIComponent;

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
