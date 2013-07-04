var Component = UIComponent;

// this is a shared object that lives on prototypes;
// don't ever mutate it!
var EMPTY_OBJECT = {};

Component({
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
    else if (child.stage !== Component.INITIAL)
      throw new Error("Child already added to another component");

    // instantiate a new dictionary to hold children rather
    // than mutating the proto's empty object
    if (self.children === EMPTY_OBJECT)
      self.children = {};

    self.children[guid] = child;

    child.parent = self;
    child._added();
  },

  remove: function (child) {
    var self = this;

    self._requireNotDestroyed();

    // Don't make any requirements of the child's stage,
    // though if it's an actual child, it won't be INTIAL.
    // It may be DESTROYED.

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

  extendHooks: {
    isRoot: function (value) {
      if (value)
        this.augment({
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