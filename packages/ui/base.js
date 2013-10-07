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

_extend(UI, {
  nextGuid: 2, // Component is 1!

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

  Component: (function (constr) {
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
  })(function Component() {}),

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


/*
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
    Deps.nonreactive(function () {
      callChainedCallback(child, 'init');
    });

    // useful in: `this.foo = this.add(Foo.extend())`
    return child;
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

  // `content` and `elseContent` must be Components or functions
  // that return components.
  content: Empty,
  elseContent: Empty,

  // The `render` method is overridden by compiled templates
  // and other components to declare the component's
  // constituent HTML/DOM and children.  It's called during
  // building on the client, and it can also be used on the
  // client or server to generate initial HTML.
  render: function (buf) {
    buf.write(this.content);
  },

  _populate: function (div) {
    var self = this;

    var buf = makeRenderBuffer(self);
    self.render(buf);

    var html = buf.getHtml();

    $(div).append(html);

    // returns info object with {start, end}
    return buf.wireUpDOM(div);
  },

  build: function () {
    var self = this;

    self._requireNotDestroyed();
    if (self.isBuilt)
      throw new Error("Component already built");

    if (! self.isInited)
      self.makeRoot();

    self._rebuilder = self.autorun(function (c) {
      // record set of children that existed before,
      // or null (for efficiency)
      var oldChildren = null;
      for (var k in self.children)
        (oldChildren || (oldChildren = {}))[k] = true;

      if (c.firstRun) {
        var div = makeSafeDiv();
        // capture reactivity:
        var info = self._populate(div);

        if (! div.firstChild)
          div.appendChild(createEmptyComment());

        self._offscreen = div;
        self.start = info.start || div.firstChild;
        self.end = info.end || div.lastChild;
      } else {
        // capture reactivity:
        self._rebuild(c.builtChildren);
      }

      var newChildren = null;
      for (var k in self.children)
        if (! (oldChildren && oldChildren[k]))
          (newChildren || (newChildren = {}))[k] = self.children[k];

      // `builtChildren` is actually children *added* during build
      c.builtChildren = newChildren;

      // don't capture dependencies, but provide a
      // parent autorun (so that any autoruns created
      // from a built callback are stopped on rebuild)
      var x = Deps.autorun(function (c) {
        if (c.firstRun) {
          self.isBuilt = true;
          self._callOnNextBuiltCallbacks();

          // FAKE-ISH (NON-DELEGATED) EVENT MAP STUFF
          if (self._events && self._events.length) {
            _.each(self._events, function (info) {
              $(self.firstNode().parentNode).find(info.selector).on(
                info.type, function (evt) {
                  if (self.containsElement(evt.currentTarget))
                    info.handler(evt);
                });
            });
          }

          callChainedCallback(self, 'rendered');
        }
      });
      Deps.onInvalidate(function () {
        x.stop();
      });
    });
  },

  // Don't call this directly.  It implements the re-run of the
  // build autorun, so it assumes it's already inside the appropriate
  // reactive computation.
  //
  // `builtChildren` is a map of children that were added during
  // the previous build (as opposed to at some other time, such as
  // earlier from an `init` callback).
  _rebuild: function (builtChildren) {
    var self = this;

    if (! (self.isBuilt && ! self.isDestroyed))
      throw new Error("Assertion failed in _rebuild");

    // Should work whether this component is detached or attached!
    // In other words, it may reside in an offscreen element.

    var firstNode = self.firstNode();
    var lastNode = self.lastNode();
    var parentNode = lastNode.parentNode;
    var nextNode = lastNode.nextSibling || null;
    var prevNode = firstNode.previousSibling || null;

    // for efficiency, do a quick check to see if we've *ever*
    // had children or if we are still using the prototype's
    // empty object.
    if (self.children !== UI.Component.children) {
      Deps.nonreactive(function () {
        // kill children from last render, and also any
        // attached children
        var children = self.children;
        for (var k in children) {
          var child = children[k];
          if (builtChildren && builtChildren[k]) {
            // destroy first, then remove
            // (which doesn't affect DOM, which we will
            // remove all at once)
            child.destroy();
            self.remove(child);
          } else if (child.isAttached) {
            // detach the child; we don't have a good way
            // of keeping this from affecting the DOM
            child.detach();
          }
        }
      });
    }

    var oldNodes = [];
    // must be careful as call to `detach` above may have
    // must with firstNode or lastNode
    for (var n = prevNode ? prevNode.nextSibling :
               parentNode.firstChild;
         n && n !== nextNode;
         n = n.nextSibling)
      oldNodes.push(n);

    $(oldNodes).remove();

    var div = makeSafeDiv();
    // set `self.start` to null so that calls to `attach` from
    // `_populate` don't try to do start/end pointer logic.
    self.start = self.end = null;
    var info = self._populate(div);
    if (! div.firstChild)
      div.appendChild(createEmptyComment());

    self.start = info.start || div.firstChild;
    self.end = info.end || div.lastChild;
    insertNodesBefore(div.childNodes, parentNode, nextNode);
  },

  // Internal method used by insertBefore, render buffer,
  // and attachRoot.
  _attach: function (parentNode, beforeNode) {
    var self = this;

    self._requireNotDestroyed();

    if (! self.isInited)
      throw new Error("Component to attach must be inited");

    if (! self.isBuilt)
      self.build();

    if (self.isAttached)
      throw new Error("Component already attached; must be detached first");

    if ((! parentNode) || ! parentNode.nodeType)
      throw new Error("first argument to attach must be a Node");
    if (beforeNode && ! beforeNode.nodeType)
      throw new Error("second argument to attach must be a Node" +
                      " if given");

    insertNodesBefore(self._offscreen.childNodes,
                      parentNode, beforeNode);

    self._offscreen = null;
    self.isAttached = true;

    var parent = self.parent;
    // We could be a root (and have no parent).  Parent could
    // theoretically be destroyed, or not yet built (if we
    // are currently building).
    //
    // We use a falsy `parent.start` as a cue that this is a
    // rebuild, another case where we skip the start/end adjustment
    // logic.
    //
    // `attach` is special in that it is used during building
    // and rebuilding; it is not required that the parent is
    // completely built.
    if (parent && parent.isBuilt && ! parent.isDestroyed &&
        parent.start) {
      if (parent.isEmpty()) {
        var comment = parent.start;
        parent.start = parent.end = self;
        comment.parentNode.removeChild(comment);
      } else {
        if (parent.firstNode() === self.lastNode().nextSibling)
          parent.start = self;
        if (parent.lastNode() === self.firstNode().previousSibling)
          parent.end = self;
      }
    }

    callChainedCallback(self, 'attached');
  },

  isEmpty: function () {
    this._requireBuilt();
    this._requireNotDestroyed();

    var start = this.start;
    return start === this.end &&
      ! UI.isComponent(start) && isEmptyComment(start);
  },

  // # component.detach()
  //
  // Component must be built and attached.  Removes this component's
  // DOM and puts it into an offscreen storage.  Updates the parent's
  // `start` and `end` and populates it with a comment if it becomes
  // empty.
  detach: function (_forDestruction) {
    var self = this;

    self._requireBuilt();
    self._requireNotDestroyed();
    if (! self.isAttached)
      throw new Error("Component not attached");

    var parent = self.parent;
    var A = self.firstNode();
    var B = self.lastNode();

    // We could be a root (and have no parent).  Parent could
    // theoretically be destroyed, or not yet built.
    if (parent && parent.isBuilt && ! parent.isDestroyed) {
      // Do some magic to update the
      // firstNode and lastNode.  The main issue is we need to
      // know if the new firstNode or lastNode is part of a
      // child component or not, because if it is, we need to
      // set `start` or `end` to the component rather than the
      // node.  Since we don't have any pointers from the DOM
      // and can't make any assumptions about the structure of
      // the component, we have to do a search over our children.
      // Repeatedly detaching the first or last of O(N) top-level
      // components is asymptotically bad -- O(n^2).
      //
      // Components that manage large numbers of top-level components
      // should override _findStartComponent and _findEndComponent.
      if (parent.start === self) {
        if (parent.end === self) {
          // we're emptying the parent; populate it with a
          // comment in an appropriate place (adjacent to
          // the not-yet-extracted DOM) and set pointers.
          var comment = createEmptyComment();
          A.parentNode.insertBefore(comment, A);
          parent.start = parent.end = comment;
        } else {
          // Removing component at the beginning of parent.
          //
          // Figure out if the following top-level node is the
          // first node of a Component.
          var newFirstNode = B.nextSibling;
          parent.start = parent._findStartComponent(newFirstNode);
          if (! (parent.start && parent.start.firstNode() === newFirstNode))
            parent.start = newFirstNode;
        }
      } else if (parent.end === self) {
        // Removing component at the end of parent.
        //
        // Figure out if the previous top-level node is the
        // last node of a Component.
        var newLastNode = A.previousSibling;
        parent.end = parent._findEndComponent(newLastNode);
        if (! (parent.end && parent.end.lastNode() === newLastNode))
          parent.end = newLastNode;
      }
    }

    var nodes = [];
    for (var n = A; n !== B; n = n.nextSibling)
      nodes.push(n);
    nodes.push(B);

    if (_forDestruction === true) {
      $(nodes).remove();
    } else {
      // Move nodes into an offscreen div, preserving
      // any event handlers and data associated with the nodes.
      var div = makeSafeDiv();
      $(div).append(nodes);

      self._offscreen = div;
      self.isAttached = false;

      callChainedCallback(self, 'detached');
    }
  },

  // # component.append(childOrDom)
  //
  // childOrDom is a Component, or node, or HTML string,
  // or array of elements (various things a la jQuery).
  //
  // Given `child`: It must be a child of this component or addable
  // as one.  Builds it if necessary.  Attaches it at the end of
  // this component.  Updates `start` and `end` of this component.

  append: function (childOrDom) {
    this.insertAfter(childOrDom, this.lastNode());
  },

  prepend: function (childOrDom) {
    this.insertBefore(childOrDom, this.firstNode());
  },

  // # component.insertBefore(childOrDom, before, parentNode)
  //
  // `before` is a Component or node.  parentNode is only used
  // if `before` is null.  It defaults to the Component's
  // parentNode.
  //
  // See append.

  insertBefore: function (childOrDom, before, parentNode) {
    var self = this;

    self._requireBuilt();
    self._requireNotDestroyed();

    if (UI.isComponent(before)) {
      before = before.firstNode();
    } else if (! before) {
      if ((! parentNode) || (parentNode === self.parentNode())) {
        before = self.lastNode().nextSibling;
        parentNode = parentNode || self.parentNode();
      }
    }
    parentNode = parentNode || before.parentNode;

    if (UI.isComponent(childOrDom)) {
      var child = childOrDom;

      child._requireNotDestroyed();

      if (! child.isInited) {
        self.add(child);
      } else if (child.parent !== self) {
        throw new Error("Can only append/prepend/insert" +
                        " a child (or a component addable as one)");
      }

      child._attach(parentNode, before);
    } else {
      var nodes;
      if (typeof childOrDom === 'string') {
        nodes = $.parseHTML(childOrDom) || [];
      } else if (childOrDom.nodeType) {
        nodes = [childOrDom];
      } else if (typeof childOrDom.length === 'number' &&
                 typeof childOrDom === 'object') {
        nodes = Array.prototype.slice.call(childOrDom);
      } else {
        throw new Error(
          "Expected HTML, DOM node, array, or Component, found " +
            childOrDom);
      }

      if (nodes.length) {
        insertNodesBefore(nodes, parentNode, before);

        if (self.isEmpty()) {
          var comment = self.start;
          comment.parentNode.removeChild(comment);
          self.start = nodes[0];
          self.end = nodes[nodes.length - 1];
        } else if (before === self.firstNode()) {
          self.start = nodes[0];
        } else if (nodes[0].previousSibling === self.lastNode()) {
          self.end = nodes[nodes.length - 1];
        }
      }
    }
  },

  insertAfter: function (childOrDom, after, parentNode) {
    var self = this;

    if (UI.isComponent(after)) {
      after = after.lastNode();
    } else if (! after) {
      if ((! parentNode) || (parentNode === self.parentNode())) {
        after = self.firstNode().previousSibling;
        parentNode = parentNode || self.parentNode();
      }
    }
    parentNode = parentNode || after.parentNode;

    this.insertBefore(childOrDom, after.nextSibling, parentNode);
  },

  // Is `elem` between `this.firstNode()` and `this.lastNode()`?
  containsElement: function (elem) {
    if (elem.nodeType !== 1)
      throw new Error("containsElement requires an Element node");

    var self = this;
    self._requireBuilt();
    self._requireNotDestroyed();

    var firstNode = self.firstNode();
    var lastNode = self.lastNode();
    if (! elementContains(firstNode.parentNode, elem))
      return false;

    // because compareElementIndex only works on elements, we find
    // previous and next element siblings. (previousSiblingElement and
    // nextSiblingElement do the same thing but they neither work on
    // IE8 nor are they available on text nodes)
    var prevElem = firstNode.previousSibling;
    while (prevElem && prevElem.nodeType !== 1)
      prevElem = prevElem.previousSibling;
    var nextElem = lastNode.nextSibling;
    while (nextElem && nextElem.nodeType !== 1)
      nextElem = nextElem.nextSibling;

    // element must not be "at or before" prevElem
    if (prevElem && compareElementIndex(prevElem, elem) >= 0)
      return false;
    // element must not be "at or after" nextElem
    if (nextElem && compareElementIndex(elem, nextElem) >= 0)
      return false;
    return true;
  },

  // Take element `elem` and find the innermost component containing
  // it which is either this component or a descendent of this component.
  findByElement: function (elem) {
    if (elem.nodeType !== 1)
      throw new Error("findByElement requires an Element node");

    var self = this;
    self._requireBuilt();

    if (! self.containsElement(elem))
      return null;

    var children = self.children;
    // XXX linear-time scan through all child components,
    // running DOM comparison methods that may themselves
    // be O(N).  Not sure what the constants are like.
    for (var k in children) {
      var child = children[k];
      if (child.isBuilt && (! child.isDestroyed) &&
          child.isAttached) {
        var found = child.findByElement(elem);
        if (found)
          return found;
      }
    }

    return self;
  },
*/
/*
_extend(UI.Component, {
  $: function (selector) {
    var self = this;

    UI._requireDom(self);
    UI._requireNotDestroyed(self);

    var firstNode = self.dom.getFirstNode();
    var parentNode = firstNode.parentNode;
    var prevNode = firstNode.previousSibling;
    var nextNode = self.dom.getLastNode().nextSibling;

    // Don't assume `results` has jQuery API; a plain array
    // should do just as well.  However, if we do have a jQuery
    // array, we want to end up with one also.
    var results = $(selector, self.dom.parentNode());

    // Function that selects only elements that are actually in this
    // Component, out of elements that are descendents of the Component's
    // parentNode in the DOM (but may be, or descend from, siblings of
    // this Component's top-level nodes that aren't between `start` and
    // `end` inclusive).
    var filterFunc = function (elem) {
      // handle jQuery's arguments to filter, where the node
      // is in `this` and the index is the first argument.
      if (typeof elem === 'number')
        elem = this;

      if (prevNode && compareElementIndex(prevNode, elem) >= 0)
        return false;
      if (nextNode && compareElementIndex(elem, nextNode) >= 0)
        return false;
      return true;
    };

    if (! results.filter) {
      // not a jQuery array, and not a browser with
      // Array.prototype.filter (e.g. IE <9)
      var newResults = [];
      for (var i = 0; i < results.length; i++) {
        var x = results[i];
        if (filterFunc(x))
          newResults.push(x);
      }
      results = newResults;
    } else {
      // `results.filter` is either jQuery's or ECMAScript's `filter`
      results = results.filter(filterFunc);
    }

    return results;
  }
});
*/
/*
  autorun: function (compFunc) {
    var self = this;

    self._requireNotDestroyed();

    // XXX so many nested functions... Deps.nonreactive here
    // feels heavyweight, but we don't want building a child
    // while building a parent to mean that when the parent
    // rebuilds, the child automatically does.
    var c = Deps.nonreactive(function () {
      return Deps.autorun(compFunc);
    });

    self._computations = self._computations || [];
    self._computations.push(c);

    return c;
  },

  replaceChild: function (oldChild, newChild) {
    var self = this;

    self._requireBuilt();
    self._requireNotDestroyed();
    oldChild._requireBuilt();
    oldChild._requireNotDestroyed();
    if (! oldChild.isAttached)
      throw new Error("Child to replace must be attached");

    var lastNode = oldChild.lastNode();
    var parentNode = lastNode.parentNode;
    var nextNode = lastNode.nextSibling;

    oldChild.remove();
    self.insertBefore(newChild, nextNode, parentNode);
  },

  swapChild: function (oldChild, newChild) {
    var self = this;

    self._requireBuilt();
    self._requireNotDestroyed();
    oldChild._requireBuilt();
    oldChild._requireNotDestroyed();
    if (! oldChild.isAttached)
      throw new Error("Child to swap out must be attached");

    var lastNode = oldChild.lastNode();
    var parentNode = lastNode.parentNode;
    var nextNode = lastNode.nextSibling;

    oldChild.detach();
    self.insertBefore(newChild, nextNode, parentNode);
  },

  _onNextBuilt: function (cb) {
    var self = this;
    var cbs = self._builtCallbacks;
    if (! cbs)
      cbs = self._builtCallbacks = [];
    cbs.push(cb);
  },

  _callOnNextBuiltCallbacks: function () {
    var self = this;
    var cbs = self._builtCallbacks;
    if (cbs) {
      for (var i = 0, N = cbs.length; i < N; i++)
        cbs[i](self);
      self._builtCallbacks.length = 0;
    }
  },

  // Return a child whose firstNode() may be `firstNode`.
  // If such a child exists, it must be found by this function.
  // If no such child exists, this function may return null
  // or a wrong guess at a child.  Subclasses that know,
  // for example, the earliest child component in the DOM
  // at all times can supply that as a guess.
  _findStartComponent: function (firstNode) {
    var children = this.children;
    // linear-time scan until found
    for (var k in children) {
      var c = children[k];
      if (c.isBuilt && c.isAttached &&
          c.firstNode() === firstNode)
        return c;
    }
    return null;
  },

  _findEndComponent: function (lastNode) {
    var children = this.children;
    // linear-time scan until found
    for (var k in children) {
      var c = children[k];
      if (c.isBuilt && c.isAttached &&
          c.lastNode() === lastNode)
        return c;
    }
    return null;
  }

  // If Component is ever emptied, it gets an empty comment node.
  // This case is treated specially and the comment is removed
  // if you then, say, append a node or component.  However,
  // the developer doing advanced things needs to be aware of
  // this case or they may be surprised there is a node there
  // that they didn't put there, e.g. if they call remove() on
  // the last component and then start inserting DOM nodes
  // manually.

  // You are free to manipulate the DOM of your component, excluding
  // the regions that belong to child components, though if you do it
  // using jQuery or any other means besides the methods here
  // (attach, detach, append, prepend, insert), you are responsible
  // for ensuring that `start` and `end` point to the first and last
  // *node or Component* at the top level of the component's DOM,
  // and that the component does not become empty

});


var emptyCommentProp = 'meteor-ui-empty';
var createEmptyComment = function (beforeNode) {
  var x = document.createComment("empty");
  x[emptyCommentProp] = true;
  return x;
};
var isEmptyComment = function (node) {
  return node.nodeType === 8 && node[emptyCommentProp] === true;
};
*/
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
/*
// Returns true if element a contains node b and is not node b.
var elementContains = function (a, b) {
  if (a.nodeType !== 1) // ELEMENT
    return false;
  if (a === b)
    return false;

  if (a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 0x10;
  } else {
    // Should be only old IE and maybe other old browsers here.
    // Modern Safari has both functions but seems to get contains() wrong.
    // IE can't handle b being a text node.  We work around this
    // by doing a direct parent test now.
    b = b.parentNode;
    if (! (b && b.nodeType === 1)) // ELEMENT
      return false;
    if (a === b)
      return true;

    return a.contains(b);
  }
};

var insertNodesBefore = function (nodes, parentNode, beforeNode) {
  if (beforeNode) {
    $(nodes).insertBefore(beforeNode);
  } else {
    $(nodes).appendTo(parentNode);
  }
};

var makeSafeDiv = function () {
  // create a DIV in a DocumentFragment, where the DocumentFragment
  // is created by jQuery, which uses tricks to create a "safe"
  // fragment for HTML5 tags in IE <9.
  var div = document.createElement("DIV");
  var frag = $.buildFragment([div], document);
  return div;
};
*/

UI.body = UI.Component.extend({
  kind: 'body',
  contentParts: [],
  render: function (buf) {
    for (var i = 0; i < this.contentParts.length; i++)
      buf.write(this.contentParts[i]);
  },
  // XXX revisit how body works.
  INSTANCE: null
});

findComponentWithProp = function (id, comp) {
  while (comp) {
    if (id in comp)
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

  if (comp.dom) {
    tmpl.firstNode = comp.dom.startNode().nextSibling;
    tmpl.lastNode = comp.dom.endNode().previousSibling;
    // Catch the case where the DomRange is empty and we'd
    // otherwise pass the out-of-order nodes (end, start)
    // as (firstNode, lastNode).
    if (tmpl.lastNode.nextSibling === tmpl.firstNode)
      tmpl.lastNode = tmpl.firstNode;
  } else {
    // on 'created' or 'destroyed' callbacks we don't have a DomRange
    tmpl.firstNode = null;
    tmpl.lastNode = null;
  }
};

_extend(UI.Component, {
  // XXX temporary definitions.
  // In particular, we need to implement the old APIs
  // (how helpers and event handlers are called) for
  // Meteor UI Stage I.
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

// XXX
UI.Component.parented = function () {
  var self = this;
  for (var comp = self; comp; comp = comp._super) {
    var events = (comp.hasOwnProperty('_events') && comp._events) || null;
    _.each(events, function (esh) { // {events, selector, handler}
      // wrap the handler here, per instance of the template that
      // declares the event map, so we can pass the instance to
      // the event handler.
      var wrappedHandler = function (event) {
        var comp = UI.DomRange.getContainingComponent(event.currentTarget);
        var data = comp && getComponentData(comp);
        updateTemplateInstance(self);
        esh.handler.call(data, event, self.templateInstance);
      };

      self.dom.on(esh.events, esh.selector, wrappedHandler);
    });
  }

  // XXX think about this callback's timing
  if (self.rendered) {
    updateTemplateInstance(self);
    self.rendered.call(self.templateInstance);
  }
};

// XXX
UI.Component.removed = function () {
  var self = this;
  if (self.destroyed) {
    updateTemplateInstance(self);
    self.destroyed.call(self.templateInstance);
  }
};

UI.Component.preserve = function () {};
