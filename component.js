// A Controller is a RenderPoint that participates in the Controller
// stack (Blaze.currentController, Controller#parentController).
// Controllers are used to hold data contexts, event maps, state,
// etc. and are more plentiful than Components.  Controller a
// superclass of Component.  Unlike a Component, it can be used in
// attribute maps (which are constructed once and evaluated multiple
// times), so it's suitable for control structures like #if, #with,
// and #each.  The contents are not isolated by default.
//
// A Component has contents that are isolated by default.  Because it
// has a Computation, the reactivity of its contents is contained and
// can be stopped.  Components are meant to be instantiated by user
// code as `new FooComponent(...)` as part of an HTMLjs tree, which
// must only be rendered once.  Components have a well-defined lifecycle,
// while Controllers straddle the gap between Components and the
// timeless RenderPoints which keep no instance state.

Blaze.Controller = Blaze.RenderPoint.extend({
  constructor: function () {
    Blaze.Controller.__super__.constructor.call(this);
    this.parentController = Blaze.currentController;
  },
  evaluate: function () {
    var self = this;
    return Blaze.withCurrentController(self, function () {
      return Blaze._evaluate(self.render());
    });
  },
  createDOMRange: function () {
    var self = this;
    var range = Blaze.withCurrentController(self, function () {
      return self.renderToDOM();
    });
    range.controller = self;
    self.domrange = range;
    return range;
  },
  // Don't call renderToDOM from the outside; just override it
  // if you need to.  Call createDOMRange instead, which sets
  // up the pointers between the range and the controller.
  renderToDOM: function () {
    return new Blaze.DOMRange(Blaze._toDOM(this.render()));
  }
});

Blaze.currentController = null;

Blaze.withCurrentController = function (controller, func) {
  var oldController = Blaze.currentController;
  try {
    Blaze.currentController = controller;
    return func();
  } finally {
    Blaze.currentController = oldController;
  }
};

Blaze.Component = Blaze.Controller.extend({
  renderToDOM: function () {
    var self = this;
    if (self.domrange)
      throw new Error("Can't render a Component twice!");

    // Note that this will reactively re-render the result
    // of the render() method.
    var range = Blaze.render(function () {
      return self.render();
    });
    range.onstop(function () {
      if (! self.isFinalized) {
        self.isFinalized = true;
        self.finalize();
      }
    });
    return range;
  },
  finalize: function () {}
});

Blaze._bindIfIsFunction = function (x, target) {
  if (typeof x !== 'function')
    return x;
  return function () {
    return x.apply(target, arguments);
  };
};

// Implements {{foo}} where `name` is "foo"
// and `component` is the component the tag is found in
// (the lexical "self," on which to look for methods).
// If a function is found, it is bound to the object it
// was found on.  Returns a function,
// non-function value, or null.
Blaze.lookup = function (name, component, options) {
  var isTemplate = options && options.template;

  if (/^\./.test(name)) {
    // starts with a dot. must be a series of dots which maps to an
    // ancestor of the appropriate height.
    if (!/^(\.)+$/.test(name)) {
      throw new Error("id starting with dot must be a series of dots");
    }

    var theWith = Blaze.getCurrentControllerOfType(Blaze.With);
    for (var i = 1; (i < name.length) && theWith; i++) {
      theWith = Blaze.getParentControllerOfType(theWith, Blaze.With);
    }

    return (theWith ? theWith.dataVar.get() : null);

  } else if (component && (name in component)) {
    // Implement "old this"
    var result = component[name];
    if (typeof result === 'function') {
      result = function () {
        var dataVar = Blaze.getCurrentDataVar();
        var data = dataVar && dataVar.get();
        if (data == null)
          data = {};
        return component[name].apply(data, arguments);
      };
    }
    return result;

    // "New this"
    //return Blaze._bindIfIsFunction(component[name], component);
  } else if (isTemplate && _.has(Template, name)) {
    return Template[name];
  } else if (UI._globalHelpers[name]) {
    return UI._globalHelpers[name];
  } else {
    var dataVar = Blaze.getCurrentDataVar();
    if (dataVar) {
      var data = dataVar.get();
      if (data) {
        return Blaze._bindIfIsFunction(data[name], data);
      }
    }
    return null;
  }
};

Blaze.lookupTemplate = function (name, component) {
  var result = Blaze.lookup(name, component, {template:true});
  if (! result)
    throw new Error("No such template: " + name);
  return result;
};

Blaze.getCurrentControllerOfType = function (type) {
  var contr = Blaze.currentController;
  if (! contr)
    // Try to catch cases where it doesn't make sense to call this.
    // There should be a currentController set anywhere it does.
    throw new Error("Can't use getCurrentControllerOfType without a Controller");

  while (contr) {
    if (contr instanceof type)
      return contr;
    contr = contr.parentController;
  }

  return null;
};

Blaze.getParentControllerOfType = function (controller, type) {
  var contr = controller.parentController;
  while (contr) {
    if (contr instanceof type)
      return contr;
    contr = contr.parentController;
  }
  return null;
};

Blaze.getElementController = function (elem) {
  var range = Blaze.DOMRange.forElement(elem);
  var controller = null;
  while (range && ! controller) {
    controller = (range.controller || null);
    if (! controller) {
      if (range.parentRange)
        range = range.parentRange;
      else
        range = Blaze.DOMRange.forElement(range.parentElement);
    }
  }
  return controller;
};

Blaze.getElementControllerOfType = function (elem, type) {
  var controller = Blaze.getElementController(elem);
  while (controller && ! (controller instanceof type)) {
    controller = (controller.parentController || null);
  }
  return controller;
};

Blaze.getCurrentDataVar = function () {
  var theWith = Blaze.getCurrentControllerOfType(Blaze.With);
  return theWith ? theWith.dataVar : null;
};

Blaze.getElementDataVar = function (elem) {
  var theWith = Blaze.getElementControllerOfType(elem, Blaze.With);
  return theWith ? theWith.dataVar : null;
};

Blaze.getComponentDataVar = function (comp) {
  var theWith = Blaze.getParentControllerOfType(comp, Blaze.With);
  return theWith ? theWith.dataVar : null;
};
