var UI = UI2;
var Component = UI.Component;

UI.Text = Component.extend({
  typeName: 'Text',
  _encodeEntities: UI.encodeSpecialEntities,
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._encodeEntities(this._stringify(data)));
  }
});

UI.HTML = Component.extend({
  typeName: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._stringify(data));
  }
});

UI.If = Component.extend({
  typeName: 'If',
  init: function () {
    this.condition = this.data;
    // content doesn't see the condition as `data`
    this.data = null;
    // XXX I guess this means it's kosher to mutate properties
    // of a Component during init (but presumably not before
    // or after)?
  },
  render: function (buf) {
    var self = this;
    // re-render if and only if condition changes
    var condition = Deps.isolateValue(function () {
      return !! self.get('condition');
    });
    buf.write(condition ? self.content : self.elseContent);
  }
});

UI.Unless = Component.extend({
  typeName: 'Unless',
  init: function () {
    this.condition = this.data;
    this.data = null;
  },
  render: function (buf) {
    var self = this;
    // re-render if and only if condition changes
    var condition = Deps.isolateValue(function () {
      return !! self.get('condition');
    });
    buf.write(condition ? self.elseContent : self.content);
  }
});


/*
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
 */