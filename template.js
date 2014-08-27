// [new] Blaze.Template([viewName], renderFunction)
//
// `Blaze.Template` is the class of templates, like `Template.foo` in
// Meteor, which is `instanceof Template`.
//
// `viewKind` is a string that looks like "Template.foo" for templates
// defined by the compiler.
Blaze.Template = function (viewName, renderFunction) {
  if (! (this instanceof Blaze.Template))
    // called without `new`
    return new Blaze.Template(viewName, renderFunction);

  if (typeof viewName === 'function') {
    // omitted "viewName" argument
    renderFunction = viewName;
    viewName = '';
  }
  if (typeof viewName !== 'string')
    throw new Error("viewName must be a String (or omitted)");
  if (typeof renderFunction !== 'function')
    throw new Error("renderFunction must be a function");

  this.viewName = viewName;
  this.renderFunction = renderFunction;

  this.__eventMaps = [];
};
var Template = Blaze.Template;

Blaze.isTemplate = function (t) {
  return (t instanceof Blaze.Template);
};

Template.prototype.constructView = function (contentFunc, elseFunc) {
  var self = this;
  var view = Blaze.View(self.viewName, self.renderFunction);
  view.template = self;

  view.templateContentBlock = (
    contentFunc ? new Template('(contentBlock)', contentFunc) : null);
  view.templateElseBlock = (
    elseFunc ? new Template('(elseBlock)', elseFunc) : null);

  if (self.__eventMaps || typeof self.events === 'object') {
    view._onViewRendered(function () {
      if (view.renderCount !== 1)
        return;

      if (! self.__eventMaps.length && typeof self.events === "object") {
        // Provide limited back-compat support for `.events = {...}`
        // syntax.  Pass `template.events` to the original `.events(...)`
        // function.  This code must run only once per template, in
        // order to not bind the handlers more than once, which is
        // ensured by the fact that we only do this when `__eventMaps`
        // is falsy, and we cause it to be set now.
        Template.prototype.events.call(self, self.events);
      }

      _.each(self.__eventMaps, function (m) {
        Blaze._addEventMap(view, m, view);
      });
    });
  }

  view._templateInstance = new Blaze.TemplateInstance(view);
  view.templateInstance = function () {
    // Update data, firstNode, and lastNode, and return the TemplateInstance
    // object.
    var inst = view._templateInstance;

    inst.data = Blaze.data(view);

    if (view._domrange && !view.isDestroyed) {
      inst.firstNode = view._domrange.firstNode();
      inst.lastNode = view._domrange.lastNode();
    } else {
      // on 'created' or 'destroyed' callbacks we don't have a DomRange
      inst.firstNode = null;
      inst.lastNode = null;
    }

    return inst;
  };

  if (self.created) {
    view.onViewCreated(function () {
      self.created.call(view.templateInstance());
    });
  }

  if (self.rendered) {
    view.onViewReady(function () {
      self.rendered.call(view.templateInstance());
    });
  }

  if (self.destroyed) {
    view.onViewDestroyed(function () {
      self.destroyed.call(view.templateInstance());
    });
  }

  return view;
};

Blaze.TemplateInstance = function (view) {
  if (! (this instanceof Blaze.TemplateInstance))
    // called without `new`
    return new Blaze.TemplateInstance(view);

  if (! (view instanceof Blaze.View))
    throw new Error("View required");

  view._templateInstance = this;
  this.view = view;
  this.data = null;
  this.firstNode = null;
  this.lastNode = null;
};

Blaze.TemplateInstance.prototype.$ = function (selector) {
  var view = this.view;
  if (! view._domrange)
    throw new Error("Can't use $ on template instance with no DOM");
  return view._domrange.$(selector);
};

Blaze.TemplateInstance.prototype.findAll = function (selector) {
  return Array.prototype.slice.call(this.$(selector));
};

Blaze.TemplateInstance.prototype.find = function (selector) {
  var result = this.$(selector);
  return result[0] || null;
};

Blaze.TemplateInstance.prototype.autorun = function (f) {
  return this.view.autorun(f);
};

Template.prototype.helpers = function (dict) {
  for (var k in dict)
    this[k] = dict[k];
};

Template.prototype.events = function (eventMap) {
  var template = this;
  var eventMap2 = {};
  for (var k in eventMap) {
    eventMap2[k] = (function (k, v) {
      return function (event/*, ...*/) {
        var view = this; // passed by EventAugmenter
        var data = Blaze.data(event.currentTarget);
        if (data == null)
          data = {};
        var args = Array.prototype.slice.call(arguments);
        var tmplInstance = view.templateInstance();
        args.splice(1, 0, tmplInstance);
        return v.apply(data, args);
      };
    })(k, eventMap[k]);
  }

  template.__eventMaps.push(eventMap2);
};

Blaze.templateInstance = function () {
  var view = Blaze.getView();

  while (view && ! view.template)
    view = view.parentView;

  if (! view)
    throw new Error("No current template");

  return view.templateInstance();
};
