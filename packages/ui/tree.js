var Component = UIComponent;

// this is a shared object that lives on prototypes;
// don't ever mutate it!
var EMPTY_OBJECT = {};

Component.include({
  parent: null,

  // We declare data structures on the prototype for
  // efficiency, but it's dangerous to put mutable objects
  // on the prototype because we have to remember never to
  // modify them in place.  In general you should initialize
  // data structures by assigning them to `this` from the `init`
  // callback.
  //
  // public, externally read-only.
  children: EMPTY_OBJECT,

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
  // The child is not attached to the DOM unless a further call
  // to `child.attach` is made specifying where to put the child
  // in the DOM.  The methods
  // `component.append(child)`, `prepend`, and `insert` can also
  // be used to add the child to the DOM, and in addition they
  // will call `add` if the child is not already added.
  //
  // Requires `component` is not destroyed.
  add: function (child) {
    var self = this;

    if (self.stage === Component.DESTROYED)
      throw new Error("Can't add child to a DESTROYED component");
    if (self.stage === Component.INITIAL)
      throw new Error("Parent component must be added or made a root before a child can be added to it");

    var guid = child.guid;

    if (self.children[guid])
      throw new Error("Child already added to this component!");
    if (child.stage === Component.DESTROYED)
      throw new Error("Can't add DESTROYED child component");
    else if (child.stage !== Component.INITIAL) {
      if (! child.parent)
        throw new Error("Can't add a root component");
      throw new Error("Child already added to another component");
    }

    // instantiate a new dictionary to hold children rather
    // than mutating the proto's empty object
    if (self.children === EMPTY_OBJECT)
      self.children = {};

    self.children[guid] = child;

    child.parent = self;
    child._added();
  },

  // # component.remove([child])
  //
  // Removes `child` from this component's list of children,
  // removes its nodes from the DOM (if it is built and attached),
  // and destroys it.  If no child is given, removes `component`
  // itself from its parent.
  //
  // If you want to just remove a component from the DOM but not
  // remove it as a child or destroy it, use `child.detach()`.
  //
  // If `child` is already destroyed, its DOM is left untouched.
  // Components with destroyed children still attached are
  // presumed to be in the process of being destroyed or rebuilt.
  //
  // Requires `component` is not destroyed.
  //
  // Updates `start` and `end` and populates the component with
  // a comment if it becomes empty.
  remove: function (child) {
    var self = this;

    self._requireNotDestroyed();

    if (! child) {
      // Support `()` form of args; remove self.
      // Can't `remove()` if we are a root or haven't been parented.
      if (self.stage === Component.INITIAL || ! self.parent)
        throw new Error("Component to remove must have a parent");
      self.parent.remove(self);
      return;
    }

    // Don't make any requirements of the child's stage,
    // though if it's actually a child, it can't be INTIAL.
    // It may be DESTROYED.

    // Note that child is not removed from the DOM if it is already
    // destroyed.  This is used when a Component is rebuilt -- the
    // children are first destroyed, then removed as children, then
    // removed from the DOM wholesale in one operation.
    if (child.stage === Component.BUILT &&
        child.isAttached) {
      child.detach();
    }

    var guid = child.guid;
    if (! self.children[guid])
      throw new Error("Child not found (id " + guid + ")");

    delete self.children[guid];
    // (don't delete child.parent pointer, could be useful
    // in destroyed callback?)

    child.destroy();
  },

  makeRoot: function () {
    var self = this;
    self._requireNotDestroyed();
    if (self.stage !== Component.INITIAL)
      throw new Error("Component already added or made a root");

    self._added();
  },

  hasChild: function (comp) {
    this._requireNotDestroyed();

    return this.children[comp.guid] === comp;
  },

  extendHooks: {
    isRoot: function (value) {
      if (value)
        this.include({
          constructed: function () {
            this.makeRoot(); } });
    }
  },

  destroyed: function () {
    // recursively destroy children as well
    for (var k in this.children)
      this.children[k].destroy();
  }
});