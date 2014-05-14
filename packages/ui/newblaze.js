UI.body2 = new Blaze.Component();

_.extend(UI.body2, {
  // content parts are render methods (expect `UI.body2` in `this`)
  contentParts: [],
  render: function () {
    var self = this;
    return _.map(this.contentParts, function (f) {
      return f.call(self);
    });
  }
});

UI.TemplateComponent = Blaze.Component.extend({
  constructor: function (dataFunc, contentFunc, elseFunc) {
    UI.TemplateComponent.__super__.constructor.call(this);

    if (dataFunc)
      this.dataFunc = dataFunc;
    if (contentFunc)
      this.contentFunc = contentFunc;
    if (elseFunc)
      this.elseFunc = elseFunc;
  },
  render: function () {
    var self = this;
    if (self.dataFunc) {
      return Blaze.With(self.dataFunc, function () {
        return self.renderTemplate();
      });
    } else {
      return self.renderTemplate();
    }
  },
  renderTemplate: function () { return null; }, // override this
  renderToDOM: function() {
    var range = UI.TemplateComponent.__super__.renderToDOM.call(this);
    if (this._eventMaps) {
      _.each(this._eventMaps, function (m) {
        range.addDOMAugmenter(new Blaze.EventAugmenter(m));
      });
    }
    return range;
  },
  events: function (eventMap) {
    this._eventMaps = (this._eventMaps || []);
    this._eventMaps.push(eventMap);
  }
});
