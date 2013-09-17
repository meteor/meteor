
UI.Text = Component.extend({
  kind: 'Text',
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
  kind: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._stringify(data));
  }
});

UI.If = Component.extend({
  kind: 'If',
  init: function () {
    // XXX this probably deserves a better explanation if this code is
    // going to stay with us.

    this.condition = this.data;
    // content doesn't see the condition as `data`
    delete this.data;
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
  kind: 'Unless',
  init: function () {
    this.condition = this.data;
    delete this.data;
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

UI.With = Component.extend({
  kind: 'With',
  render: function (buf) {
    buf.write(this.content);
  }
});