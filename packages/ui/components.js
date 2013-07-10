var Component = UIComponent;

_UI.Text = Component.extend({
  typeName: 'Text',
  _encodeEntities: _UI.encodeSpecialEntities,
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.data();
    buf(this._encodeEntities(this._stringify(data)));
  }
});

_UI.HTML = Component.extend({
  typeName: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.data();
    buf(this._stringify(data));
  }
});

_UI.If = Component.extend({
  typeName: 'If',
  render: function (buf) {
    var self = this;
    var condition = Deps.isolate(function () {
      return !! self.data();
    });
    buf(condition ? self.content() : self.elseContent());
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

_UI.Counter = Component.extend({
  typeName: "Counter",
  fields: {
    count: 0
  },
  increment: function () {
    this.set('count', this.count() + 1);
  },
  render: function (buf) {
    var self = this;

    buf("<div style='background:yellow'>",
        new _UI.Text(function () {
          return self.count();
        }),
        "</div>");
  },
  built: function () {
    var self = this;
    self.$("div").on('click', function (evt) {
      self.increment();
    });
  }
});