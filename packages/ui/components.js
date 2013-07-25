
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
  init: function () {
    // here we implement the idea that the one positional arg to
    // a component becomes its data by default, but components
    // like `#if` don't want it to be the data context
    // seen by the content so they can change it.
    // the implementation will change (but not the idea)
    // if Geoff's proposal for extend and args is implemented.
    // It's also possible the right thing to do is
    // to have `arg` and `data` be separate.
    this.condition = this.data;
    this.data = this.parent.data;
  },
  render: function (buf) {
    var self = this;
    var condition = Deps.isolateValue(function () {
      return !! self.condition();
    });
    buf(condition ? self.content() : self.elseContent());
  }
});

UI.Unless = Component.extend({
  typeName: 'Unless',
  init: function () {
    // see comment in `If`
    this.condition = this.data;
    this.data = this.parent.data;
  },
  render: function (buf) {
    var self = this;
    var condition = Deps.isolateValue(function () {
      return ! self.condition();
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