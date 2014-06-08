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

if (Meteor.isClient) {
  UI.TemplateRenderedAugmenter = Blaze.DOMAugmenter.extend({
    constructor: function () {
      this.fired = false;
    },
    attach: function (range, element) {
      if (! this.fired) {
        this.fired = true; // only fire once
        var tmpl = range.controller;
        if (tmpl.rendered && ! tmpl.isFinalized) {
          Deps.afterFlush(function () {
            if (! tmpl.isFinalized) {
              var templateInstance = {}; // XXX
              tmpl.rendered.call(templateInstance);
            }
          });
        }
      }
    }
  });
}

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
    if (! this._eventMaps &&
        typeof this.events === "object") {
      // Provide limited back-compat support for `.events = {...}`
      // syntax.  Pass `this.events` to the original `.events(...)`
      // function.  This code must run only once per component, in
      // order to not bind the handlers more than once, which is
      // ensured by the fact that we only do this when `this._eventMaps`
      // is falsy, and we cause it to be set now.
      UI.TemplateComponent.prototype.events.call(this, this.events);
    }

    if (this._eventMaps) {
      _.each(this._eventMaps, function (m) {
        range.addDOMAugmenter(new Blaze.EventAugmenter(m));
      });
    }
    if (this.rendered) {
      range.addDOMAugmenter(new UI.TemplateRenderedAugmenter);
    }
    return range;
  },
  events: function (eventMap) {
    this._eventMaps = (this._eventMaps || []);
    // implement "old this"
    var eventMap2 = {};
    for (var k in eventMap) {
      eventMap2[k] = (function (k, v) {
        return function (event/*, ...*/) {
          var dataVar = Blaze.getElementDataVar(event.currentTarget);
          var data = dataVar && dataVar.get();
          if (data == null)
            data = {};
          var args = Array.prototype.slice.call(arguments);
          var tmplInstance = {}; // XXX
          args.splice(1, 0, tmplInstance);
          return v.apply(data, args);
        };
      })(k, eventMap[k]);
    }

    this._eventMaps.push(eventMap2);
  },
  helpers: function (dict) {
    _.extend(this, dict);
  },
  extend: function () {
    throw new Error(
      "Component#extend was part of a private API that has been removed");
  }
});
