// @export UI2
var UI = UI2 = {
  nextGuid: 2, // Component is 1!

  // Components and Component "classes" are the same thing, just
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

  Component: {
    // If a Component has a `typeName` property set via `extend`,
    // we make it use that name when printed in Chrome Dev Tools.
    // If you then extend this Component and don't supply any
    // new typeName, it should use the same typeName (or the
    // most specific one in the case of an `extend` chain with
    // `typeName` set at multiple points).
    //
    // To accomplish this, keeping performance in mind,
    // any Component where `typeName` is explicitly set
    // also has a function property `_constr` whose source-code
    // name is `typeName`.  `extend` creates this `_constr`
    // function, which can then be used internally as a
    // constructor to quickly create new instances that
    // pretty-print correctly.
    typeName: "Component",
    _constr: function Component() {},

    _super: null,
    guid: 1,

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

      // Any Component with a typeName of "Foo" (say) is given
      // a `._constr` of the form `function Foo() {}`.
      if (props && props.typeName)
        this._constr =
          Function("return function " +
                   sanitizeTypeName(props.typeName) +
                   "() {};")();

      // We don't know where we're getting `_constr` from --
      // it might be from some supertype -- just that it has
      // the right function name.  So set the `prototype`
      // property each time we use it as a constructor.
      this._constr.prototype = this;

      var c = new this._constr;
      if (props)
        _extend(c, props);

      // for efficient Component instantiations, we assign
      // as few things as possible here.
      c._super = this;
      c.guid = UI.nextGuid++;

      return c;
    },

    // `x.isa(Foo)` where `x` is a Component returns `true`
    // if `x` is `Foo` or a Component that descends from
    // (transitively extends) `Foo`.
    isa: function (obj) {
      var x = this;
      while (x) {
        if (x === obj)
          return true;
        x = x._super;
      }
      return false;
    }
  },
  isComponent: function (obj) {
    return obj && obj.isa === UI.Component.isa;
  }
};

// A very basic operation like Underscore's `_.extend` that
// copies `src`'s own, enumerable properties onto `tgt` and
// returns `tgt`.
_extend = function (tgt, src) {
  for (var k in src)
    if (src.hasOwnProperty(k))
      tgt[k] = src[k];
  return tgt;
};

callChainedCallback = function (comp, propName) {
  if (comp._super)
    callChainedCallback(comp._super, propName);

  if (comp.hasOwnProperty(propName))
    comp[propName].call(comp);
};

// Make `typeName` a non-empty string starting with an ASCII
// letter or underscore and containing only letters, underscores,
// and numbers.  This makes it safe to insert into evaled JS
// code.
var sanitizeTypeName = function (typeName) {
  return String(typeName).replace(/^[^a-zA-Z_]|[^a-zA-Z_0-9]+/g,
                                  '') || 'Component';
};

var SEALED_EMPTY_OBJECT = {};
if (Object.seal)
  // IE 9+, FF, Chrome, Safari
  Object.seal(SEALED_EMPTY_OBJECT);

_extend(UI.Component, {
  // Has this Component ever been inited?
  isInited: false,
  // Has this Component ever been built into DOM nodes?
  // Implies isInited.
  isBuilt: false,
  // Has this Component been destroyed?  Only inited Components
  // can be destroyed, but built and unbuilt Components
  // can both be destroyed (and their value of isBuilt
  // stays the same when they are).
  isDestroyed: false,

  destroy: function () {
    if (! this.isInited)
      throw new Error("Can't destroy an uninited Component");

    if (this.isDestroyed)
      return;

    this.isDestroyed = true;

    callChainedCallback(this, 'destroyed');
  },

  // use this to produce error messages for developers
  // (though throwing a more specific error message is
  // even better)
  _requireNotDestroyed: function () {
    if (this.isDestroyed)
      throw new Error("Component has been destroyed; can't perform this operation");
  },

  _requireInited: function () {
    if (! this.isInited)
      throw new Error("Component must be inited to perform this operation");
  },

  _requireBuilt: function () {
    if (! this.isBuilt)
      throw new Error("Component must be built into DOM to perform this operation");
  }

});

_extend(UI.Component, {
  // Parent Component in the composition hierarchy.
  // An inited
  parent: null,
  // Child Components in the composition hierarchy,
  // in a dictionary keyed on their `guid` property.
  //
  // For memory efficiency, childless Components share
  // the same dictionary.
  children: SEALED_EMPTY_OBJECT,

  // # component.add(child)
  //
  // Adds `child` to this component in the parent/child
  // hierarchy.
  //
  // Components must be assembled from "top to bottom."  Each
  // component must either be added as a child of another,
  // or made a root using `component.makeRoot()`, before
  // it can receive its own children.  This ensures that
  // every component already knows its parent when it is
  // initialized.  A component's parent is permanent; the
  // component cannot be removed or reparented without
  // destroying it.
  //
  // The child is not built or put into the DOM.
  // The `append`, `prepend`, and `insertBefore`
  // methods all add their argument as a child in addition
  // to building it if necessary and putting it into the
  // component's DOM.
  //
  // Requires `component` is not destroyed.
  add: function (child) {
    var self = this;

    if (self.isDestroyed)
      throw new Error("Can't add child to a destroyed component");
    if (! self.isInited)
      throw new Error("Component must be inited already to add a child");

    var guid = child.guid;

    if (self.children[guid])
      throw new Error("Child already added to this component!");

    if (child.isInited)
      throw new Error("Child already inited, can't add to a different parent");

    // allocate a new dictionary to hold children if necessary
    if (self.children === SEALED_EMPTY_OBJECT)
      self.children = {};

    self.children[guid] = child;

    child.parent = self;

    // Note on ordering of these two lines:  You see `isInited`
    // as `true` from `init` callbacks, even though
    // linguistically it seems odd that you are marked
    // inited before `init` is called.  What's really going
    // on is `init` is a callback which would normally be
    // named in the past tense; for example, we'd set
    // `isAdded` to true and then call the `added` callback.
    //
    // `isInited` in fact means essentially "has been added/
    // instantiated", and `init` is the callback you get
    // when that happens.
    child.isInited = true;
    callChainedCallback(child, 'init');
  },

  hasChild: function (comp) {
    this._requireNotDestroyed();
    this._requireInited();

    return this.children[comp.guid] === comp;
  },

  // Init this Component without giving it a parent; it will
  // never have a parent and always be the root of its own
  // parent/child hierarchy.
  //
  // This is primarily intended for unit testing, or embedding
  // Meteor UI.
  makeRoot: function (comp) {
    if (this.isInited) {
      if (this.parent)
        throw new Error("Component already parented");
      throw new Error("Component already inited as a root");
    }

    this.isInited = true;
    callChainedCallback(this, 'init');
  },

  remove: function (child) {
    var self = this;

    self._requireNotDestroyed();

    if (! child) {
      // Support `()` form of args; remove self.
      // Can't `remove()` if we are a root or haven't been
      // inited.
      if (! self.isInited || ! self.parent)
        throw new Error("Component to remove must have a parent");
      self.parent.remove(self);
      return;
    }

    // Child is inited but may or may not be built.
    // Child may be destroyed.

    // Note that child is not removed from the DOM if it is already
    // destroyed.  This is used when a Component is rebuilt -- the
    // children are first destroyed, then removed as children, then
    // removed from the DOM wholesale in one operation.
    if (child.isBuilt && ! child.isDestroyed &&
        child.isAttached) {

      child.detach(true); // _forDestruction = true
    }

    var guid = child.guid;
    if (! self.children[guid])
      throw new Error("Child not found (id " + guid + ")");

    delete self.children[guid];
    // (don't delete child.parent pointer, could be useful
    // in destroyed callback?)

    child.destroy();

  }
});

_extend(UI.Component, {
  // If the Component is built into DOM, `start` and `end`
  // are the first and last *nodes or Components* in this
  // Component's subtree of DOM nodes and Components.
  start: null,
  end: null,

  firstNode: function () {
    this._requireBuilt();
    this._requireNotDestroyed();

    return UI.isComponent(this.start) ?
      this.start.firstNode() : this.start;
  },

  lastNode: function () {
    this._requireBuilt();
    this._requireNotDestroyed();

    return UI.isComponent(this.end) ?
      this.end.lastNode() : this.end;
  },

  parentNode: function () {
    return this.firstNode().parentNode;
  },

  // Built Components are either attached or detached.
  // An attached Component is assumed to be part of
  // its parent's DOM tree (or for a root Component, the
  // document).  A detached Component lives in its own private
  // offscreen DIV.  Components start detached (offscreen) but
  // are typically attached immediately.  They may then be
  // attached and detached at will, which inserts and removes
  // them from the parent's DOM.  A detached Component has
  // a functional DOM and can have attached and detached
  // children.
  //
  // Components should only be inserted into the DOM by calling
  // `append`, `insertBefore`, et al. on their parent, or
  // for a root using `attachRoot`.
  isAttached: false,

  // DIV holding offscreen content (when component is built and not attached).
  // It's a DIV rather than a fragment so that jQuery can run against it.
  _offscreen: null,

  content: UI.Component,
  elseContent: UI.Component

});

UI.body = UI.Component.extend({
  typeName: 'body'
});

Meteor.startup(function () {
  // XXX init and insert UI.body
});