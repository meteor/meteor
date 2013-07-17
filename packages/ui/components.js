
// All `<body>` tags in HTML files are compiled to extend
// Body.  If you put helpers and events on Body, they all
// inherit them.
UI.Body = Component.extend({isRoot: true});

UI.Text = Component.extend({
  typeName: 'Text',
  _encodeEntities: UI.encodeSpecialEntities,
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.data();
    buf(this._encodeEntities(this._stringify(data)));
  }
});

UI.HTML = Component.extend({
  typeName: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.data();
    buf(this._stringify(data));
  }
});

UI.If = Component.extend({
  typeName: 'If',
  render: function (buf) {
    var self = this;
    var condition = Deps.isolate(function () {
      return !! self.data();
    });
    buf(condition ? self.content() : self.elseContent());
  }
});

UI.Unless = Component.extend({
  typeName: 'Unless',
  render: function (buf) {
    var self = this;
    var condition = Deps.isolate(function () {
      return ! self.data();
    });
    buf(condition ? self.content() : self.elseContent());
  }
});

UI.Counter = Component.extend({
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
        new UI.Text(function () {
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