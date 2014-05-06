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

Blaze.Controller = function () {
  this.parentController = Blaze.currentController;
};
__extends(Blaze.Controller, Blaze.RenderPoint);

_.extend(Blaze.Controller.prototype, {
  evaluate: function () {
    var self = this;
    return Blaze.withCurrentController(self, function () {
      return Blaze.evaluate(self.render());
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
  renderToDOM: function () {
    return new Blaze.DOMRange(Blaze.toDOM(this.render()));
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

Blaze.Component = function () {
  Blaze.Controller.call(this);
};
__extends(Blaze.Component, Blaze.Controller);

_.extend(Blaze.Component.prototype, {
  renderToDOM: function () {
    var self = this;
    if (self.domrange)
      throw new Error("Can't render a Component twice!");

    var range = Blaze.render(function () {
      return self.render();
    });
    range.onstop(function () {
      self.finalize();
    });
    return range;
  },
  finalize: function () {}
});

// XXX experimental.  Implements {{foo}} where `name` is "foo"
// and `component` is the component the tag is found in
// (the lexical "self," on which to look for methods).
// If a function is found, it is bound to the object it
// was found on.  Returns a function,
// non-function value, or null.
Blaze.lookup = function (name, component) {
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
    var ret = component[name];
    if (typeof ret === 'function') {
      ret = function () {
        return component[name].apply(component, arguments);
      };
    }
    return ret;
  } else {
    var dataVar = Blaze.getCurrentDataVar();
    if (dataVar) {
      var data = dataVar.get();
      if (data) {
        return data[name];
      }
    }
    return null;
  }
};

// XXX obviously this needs to do more stuff
Blaze.lookupTemplate = function (name, component) {
  return Blaze.lookup(name, component);
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

Blaze.getCurrentDataVar = function () {
  var theWith = Blaze.getCurrentControllerOfType(Blaze.With);
  return theWith && theWith.dataVar;
};
