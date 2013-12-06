UI = {};

// A very basic operation like Underscore's `_.extend` that
// copies `src`'s own, enumerable properties onto `tgt` and
// returns `tgt`.
_extend = function (tgt, src) {
  for (var k in src)
    if (src.hasOwnProperty(k))
      tgt[k] = src[k];
  return tgt;
};

// Defines a single non-enumerable, read-only property
// on `tgt`.
// It won't be non-enumerable in IE 8, so its
// non-enumerability can't be relied on for logic
// purposes, it just makes things prettier in
// the dev console.
var _defineNonEnum = function (tgt, name, value) {
  try {
    Object.defineProperty(tgt, name, {value: value});
  } catch (e) {
    // IE < 9
    tgt[name] = value;
  }
  return tgt;
};

// Make `typeName` a non-empty string starting with an ASCII
// letter or underscore and containing only letters, underscores,
// and numbers.  This makes it safe to insert into evaled JS
// code.
var sanitizeTypeName = function (typeName) {
  return String(typeName).replace(/^[^a-zA-Z_]|[^a-zA-Z_0-9]+/g,
                                  '') || 'Component';
};

// Named function (like `function Component() {}` below) make
// inspection in debuggers more descriptive. In IE, this sets the
// value of the `Component` var in the function scope in which it's
// executed. We already have a top-level `Component` var so we create
// a new function scope to not write it over in IE.
(function () {

  // Components and Component kinds are the same thing, just
  // objects; there are no constructor functions, no `new`,
  // and no `instanceof`.  A Component object is like a class,
  // until it is inited, at which point it becomes more like
  // an instance.
  //
  // `y = x.extend({ ...new props })` creates a new Component
  // `y` with `x` as its prototype, plus additional properties
  // on `y` itself.  `extend` is used both to subclass and to
  // create instances (and the hope is we can gloss over the
  // difference in the docs).
  UI.Component = (function (constr) {

    // Make sure the "class name" that Chrome infers for
    // UI.Component is "Component", and that
    // `new UI.Component._constr` (which is what `extend`
    // does) also produces objects whose inferred class
    // name is "Component".  Chrome's name inference rules
    // are a little mysterious, but a function name in
    // the source code (as in `function Component() {}`)
    // seems to be reliable and high precedence.
    var C = new constr;
    _defineNonEnum(C, '_constr', constr);
    _defineNonEnum(C, '_super', null);
    return C;
  })(function Component() {});
})();

_extend(UI, {
  nextGuid: 2, // Component is 1!

  isComponent: function (obj) {
    return obj && UI.isKindOf(obj, UI.Component);
  },
  // `UI.isKindOf(a, b)` where `a` and `b` are Components
  // (or kinds) asks if `a` is or descends from
  // (transitively extends) `b`.
  isKindOf: function (a, b) {
    while (a) {
      if (a === b)
        return true;
      a = a._super;
    }
    return false;
  },
  // use these to produce error messages for developers
  // (though throwing a more specific error message is
  // even better)
  _requireNotDestroyed: function (c) {
    if (c.isDestroyed)
      throw new Error("Component has been destroyed; can't perform this operation");
  },
  _requireInited: function (c) {
    if (! c.isInited)
      throw new Error("Component must be inited to perform this operation");
  },
  _requireDom: function (c) {
    if (! c.dom)
      throw new Error("Component must be built into DOM to perform this operation");
  }
});

Component = UI.Component;

_extend(UI.Component, {
  // If a Component has a `kind` property set via `extend`,
  // we make it use that name when printed in Chrome Dev Tools.
  // If you then extend this Component and don't supply any
  // new `kind`, it should use the same value of kind (or the
  // most specific one in the case of an `extend` chain with
  // `kind` set at multiple points).
  //
  // To accomplish this, keeping performance in mind,
  // any Component where `kind` is explicitly set
  // also has a function property `_constr` whose source-code
  // name is `kind`.  `extend` creates this `_constr`
  // function, which can then be used internally as a
  // constructor to quickly create new instances that
  // pretty-print correctly.
  kind: "Component",
  guid: "1",
  dom: null,
  // Has this Component ever been inited?
  isInited: false,
  // Has this Component been destroyed?  Only inited Components
  // can be destroyed.
  isDestroyed: false,
  // Component that created this component (typically also
  // the DOM containment parent).
  // No child pointers (except in `dom`).
  parent: null,

  // Extend this component with a given data context. This is
  // typically used in template helpers generating a dynamic
  // template. Using this doesn't require understanding the Component
  // OO system, which we're not document yet and may change.
  withData: function (data) {
    return this.extend({data: data});
  },

  // create a new subkind or instance whose proto pointer
  // points to this, with additional props set.
  extend: function (props) {
    // this function should never cause `props` to be
    // mutated in case people want to reuse `props` objects
    // in a mixin-like way.

    if (this.isInited)
      // Disallow extending inited Components so that
      // inited Components don't inherit instance-specific
      // properties from other inited Components, just
      // default values.
      throw new Error("Can't extend an inited Component");

    var constr;
    var constrMade = false;
    // Any Component with a kind of "Foo" (say) is given
    // a `._constr` of the form `function Foo() {}`.
    if (props && props.kind) {
      constr = Function("return function " +
                        sanitizeTypeName(props.kind) +
                        "() {};")();
      constrMade = true;
    } else {
      constr = this._constr;
    }

    // We don't know where we're getting `constr` from --
    // it might be from some supertype -- just that it has
    // the right function name.  So set the `prototype`
    // property each time we use it as a constructor.
    constr.prototype = this;

    var c = new constr;
    if (constrMade)
      c._constr = constr;

    if (props)
      _extend(c, props);

    // for efficient Component instantiations, we assign
    // as few things as possible here.
    _defineNonEnum(c, '_super', this);
    c.guid = String(UI.nextGuid++);

    return c;
  }
});

//callChainedCallback = function (comp, propName, orig) {
  // Call `comp.foo`, `comp._super.foo`,
  // `comp._super._super.foo`, and so on, but in reverse
  // order, and only if `foo` is an "own property" in each
  // case.  Furthermore, the passed value of `this` should
  // remain `comp` for all calls (which is achieved by
  // filling in `orig` when recursing).
//  if (comp._super)
//    callChainedCallback(comp._super, propName, orig || comp);
//
//  if (comp.hasOwnProperty(propName))
//    comp[propName].call(orig || comp);
//};


// Returns 0 if the nodes are the same or either one contains the other;
// otherwise, -1 if a comes before b, or else 1 if b comes before a in
// document order.
// Requires: `a` and `b` are element nodes in the same document tree.
var compareElementIndex = function (a, b) {
  // See http://ejohn.org/blog/comparing-document-position/
  if (a === b)
    return 0;
  if (a.compareDocumentPosition) {
    var n = a.compareDocumentPosition(b);
    return ((n & 0x18) ? 0 : ((n & 0x4) ? -1 : 1));
  } else {
    // Only old IE is known to not have compareDocumentPosition (though Safari
    // originally lacked it).  Thankfully, IE gives us a way of comparing elements
    // via the "sourceIndex" property.
    if (a.contains(b) || b.contains(a))
      return 0;
    return (a.sourceIndex < b.sourceIndex ? -1 : 1);
  }
};

findComponentWithProp = function (id, comp) {
  while (comp) {
    if (comp[id])
      return comp;
    comp = comp.parent;
  }
  return null;
};

getComponentData = function (comp) {
  comp = findComponentWithProp('data', comp);
  return (comp ?
          (typeof comp.data === 'function' ?
           comp.data() : comp.data) :
          null);
};

updateTemplateInstance = function (comp) {
  // Populate `comp.templateInstance.{firstNode,lastNode,data}`
  // on demand.
  var tmpl = comp.templateInstance;
  tmpl.data = getComponentData(comp);

  if (comp.dom && !comp.isDestroyed) {
    tmpl.firstNode = comp.dom.startNode().nextSibling;
    tmpl.lastNode = comp.dom.endNode().previousSibling;
    // Catch the case where the DomRange is empty and we'd
    // otherwise pass the out-of-order nodes (end, start)
    // as (firstNode, lastNode).
    if (tmpl.lastNode && tmpl.lastNode.nextSibling === tmpl.firstNode)
      tmpl.lastNode = tmpl.firstNode;
  } else {
    // on 'created' or 'destroyed' callbacks we don't have a DomRange
    tmpl.firstNode = null;
    tmpl.lastNode = null;
  }
};

_extend(UI.Component, {
  // We implement the old APIs here, including how data is passed
  // to helpers in `this`.
  helpers: function (dict) {
    _extend(this, dict);
  },
  events: function (dict) {
    var events;
    if (this.hasOwnProperty('_events'))
      events = this._events;
    else
      events = (this._events = []);

    _.each(dict, function (handler, spec) {
      var clauses = spec.split(/,\s+/);
      // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
      _.each(clauses, function (clause) {
        var parts = clause.split(/\s+/);
        if (parts.length === 0)
          return;

        var newEvents = parts.shift();
        var selector = parts.join(' ');
        events.push({events: newEvents,
                     selector: selector,
                     handler: handler});
      });
    });
  }
});

// XXX we don't really want this to be a user-visible callback,
// it's just a particular signal we need from DomRange.
UI.Component.parented = function () {
  var self = this;
  for (var comp = self; comp; comp = comp._super) {
    var events = (comp.hasOwnProperty('_events') && comp._events) || null;
    if ((! events) && comp.hasOwnProperty('events') &&
        typeof comp.events === 'object') {
      // Provide limited back-compat support for `.events = {...}`
      // syntax.  Pass `comp.events` to the original `.events(...)`
      // function.  This code must run only once per component, in
      // order to not bind the handlers more than once, which is
      // ensured by the fact that we only do this when `comp._events`
      // is falsy, and we cause it to be set now.
      UI.Component.events.call(comp, comp.events);
      events = comp._events;
    }
    _.each(events, function (esh) { // {events, selector, handler}
      // wrap the handler here, per instance of the template that
      // declares the event map, so we can pass the instance to
      // the event handler.
      var wrappedHandler = function (event) {
        var comp = UI.DomRange.getContainingComponent(event.currentTarget);
        var data = comp && getComponentData(comp);
        updateTemplateInstance(self);
        Deps.nonreactive(function () {
          // Don't want to be in a deps context, even if we were somehow
          // triggered synchronously in an existing deps context
          // (the `blur` event can do this).
          // XXX we should probably do what Spark did and block all
          // event handling during our DOM manip.  Many apps had weird
          // unanticipated bugs until we did that.
          esh.handler.call(data, event, self.templateInstance);
        });
      };

      self.dom.on(esh.events, esh.selector, wrappedHandler);
    });
  }

  // XXX think about this callback's timing
  if (self.rendered) {
    Deps.nonreactive(function () {
      updateTemplateInstance(self);
      self.rendered.call(self.templateInstance);
    });
  }
};

// XXX we don't really want this to be a user-visible callback,
// it's just a particular signal we need from DomRange.
UI.Component.removed = function () {
  var self = this;
  self.isDestroyed = true;
  if (self.destroyed) {
    Deps.nonreactive(function () {
      updateTemplateInstance(self);
      self.destroyed.call(self.templateInstance);
    });
  }
};

// past compat
UI.Component.preserve = function () {};
