UI.body2 = new Blaze.Component();

_.extend(UI.body2, {
  // content parts are render methods (which expect `UI.body2` in `this`)
  contentParts: [],
  render: function () {
    var self = this;
    return _.map(this.contentParts, function (f) {
      return f.call(self);
    });
  }
});

updateTemplateInstance = function (comp) {
  // Populate `comp.templateInstance.{firstNode,lastNode,data}`
  // on demand.
  var tmpl = comp._templateInstance;
  if (! tmpl) {
    tmpl = comp._templateInstance = {
      $: function (selector) {
        if (! comp.domrange)
          throw new Error("Can't use $ on component with no DOM");
        return comp.domrange.$(selector);
      },
      findAll: function (selector) {
        return Array.prototype.slice.call(this.$(selector));
      },
      find: function (selector) {
        var result = this.$(selector);
        return result[0] || null;
      },
      data: null,
      firstNode: null,
      lastNode: null,
      __component__: comp
    };
  }
  // assume `comp` is a UI.TemplateComponent, for now
  if (comp.__dataFunc)
    tmpl.data = comp.__dataFunc();
  else
    tmpl.data = null;

  if (comp.domrange && !comp.isFinalized) {
    tmpl.firstNode = comp.domrange.firstNode();
    tmpl.lastNode = comp.domrange.lastNode();
  } else {
    // on 'created' or 'destroyed' callbacks we don't have a DomRange
    tmpl.firstNode = null;
    tmpl.lastNode = null;
  }

  return tmpl;
};

UI._templateInstance = function () {
  var currentTemplate = Blaze.getCurrentControllerOfType(UI.TemplateComponent);
  if (! currentTemplate)
    throw new Error("No current template");

  return updateTemplateInstance(currentTemplate);
};

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
              var templateInstance = updateTemplateInstance(tmpl);
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

    if (dataFunc) {
      this.__dataFunc = dataFunc;
    }
    if (contentFunc) {
      this.__contentBlock = Blaze.Component.extend({
        render: function () { return contentFunc(); }
      }).prototype;
    }
    if (elseFunc) {
      this.__elseBlock = Blaze.Component.extend({
        render: function () { return elseFunc(); }
      }).prototype;
    }
  },
  render: function () {
    var self = this;

    var self = this;
    if (self.created) {
      var templateInstance = updateTemplateInstance(self);
      Deps.nonreactive(function () {
        self.created.call(templateInstance);
      });
    }

    if (self.__dataFunc) {
      return Blaze.With(self.__dataFunc, function () {
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
    var self = this;
    self._eventMaps = (self._eventMaps || []);
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
          var tmplInstance = updateTemplateInstance(self);
          args.splice(1, 0, tmplInstance);
          return v.apply(data, args);
        };
      })(k, eventMap[k]);
    }

    self._eventMaps.push(eventMap2);
  },
  helpers: function (dict) {
    _.extend(this, dict);
  },
  extend: function () {
    throw new Error(
      "Component#extend was part of a private API that has been removed");
  },
  __contentBlock: null,
  __elseBlock: null,
  finalize: function () {
    var self = this;
    if (self.destroyed) {
      var templateInstance = updateTemplateInstance(self);
      Deps.nonreactive(function () {
        self.destroyed.call(templateInstance);
      });
    }
  }
});
