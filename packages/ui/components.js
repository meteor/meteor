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
    buf(self.content(function () { return 0; })),
    buf(self.content(function () { return 1; }));
    buf(self.content(function () { return 2; }));
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