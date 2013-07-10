var Component = UIComponent;

var emptyCommentProp = 'meteor-ui-empty';
var createEmptyComment = function (beforeNode) {
  var x = document.createComment("empty");
  x[emptyCommentProp] = true;
  return x;
};

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

// Returns true if element a contains node b and is not node b.
var elementContains = function (a, b) {
  if (a.nodeType !== 1) /* ELEMENT */
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
    if (! (b && b.nodeType === 1)) /* ELEMENT */
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

Component.include({
  start: null,
  end: null,

  firstNode: function () {
    this._requireBuilt();
    return this.start instanceof Component ?
      this.start.firstNode() : this.start;
  },

  lastNode: function () {
    this._requireBuilt();
    return this.end instanceof Component ?
      this.end.lastNode() : this.end;
  },

  parentNode: function () {
    return this.firstNode().parentNode;
  },

  isAttached: false,

  // DIV holding offscreen content (if component is BUILT and not attached).
  // It's a DIV rather than a fragment so that jQuery can run against it.
  _offscreen: null,

  // Unlike Component constructor, caller is not allowed to skip `dataFunc`
  // and pass `options` as the first argument.  However, `dataFunc`
  // may be falsy and `options` is optional.
  //
  // The idea is that a Component type makes a perfect value
  // for `content`, but you can also write your own function
  // that constructs a Component. This function can return null.
  content: function (dataFunc, options) { return null; },
  elseContent: function (dataFunc, options) { return null; },

  render: function (buf) {
    buf(this.content());
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
    if (self.stage === Component.BUILT)
      throw new Error("Component already built");
    if (self.stage !== Component.ADDED)
      throw new Error("Component must be added to a parent (or made a root) before building");

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

      c.builtChildren = newChildren;

      // don't capture dependencies, but provide a
      // parent autorun (so that any autoruns created
      // from a built callback are stopped on rebuild)
      var x = Deps.autorun(function (c) {
        if (c.firstRun)
          self._built();
      });
      Deps.onInvalidate(function () {
        x.stop();
      });
    });
  },

  // Components normally reactively rebuild.  This method is only to
  // be used if you need to manually trigger a rebuild for some
  // reason.
  rebuild: function () {
    this._requireBuilt();

    if (this._rebuilder)
      this._rebuilder.invalidate();
  },

  // Don't call this directly.  It implements the re-run of the
  // build autorun, so it assumes it's already inside the appropriate
  // reactive computation.  Use `rebuild` which simply invalidates the
  // computation.
  //
  // `builtChildren` is a map of children that were added during
  // the previous build (as opposed to at some other time, such as
  // earlier from an `init` callback).
  _rebuild: function (builtChildren) {
    var self = this;

    self._assertStage(Component.BUILT);

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
    if (self.children !== UIComponent.prototype.children) {
      Deps.nonreactive(function () {
        // kill children from last render, and also any
        // attached children
        var children = self.children;
        for (var k in children) {
          var child = children[k];
          if (builtChildren[k]) {
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

  // # component.attach(parentNode, [beforeNode])
  //
  // Requires `component` be parented (or a root) and not attached.
  // Builds it
  // if necessary, then inserts it into the DOM at the specified
  // location.
  //
  // If you want to move a Component in the DOM, detach it first
  // and then attach it somewhere else.
  attach: function (parentNode, beforeNode) {
    var self = this;

    self._requireNotDestroyed();

    if (self.stage === Component.INITIAL)
      throw new Error("Component to attach must have a parent (or be a root)");

    if (self.stage === Component.ADDED) // not built
      self.build();

    self._assertStage(Component.BUILT);

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
    // We use a falsy `parent.start` as a cue that this is a
    // rebuild, another case where we skip the start/end adjustment
    // logic.
    if (parent && parent.stage === Component.BUILT &&
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

    self.attached();
  },

  // # component.detach()
  //
  // Component must be built and attached.  Removes this component's
  // DOM and puts it into an offscreen storage.  Updates the parent's
  // `start` and `end` and populates it with a comment if it becomes
  // empty.
  detach: function () {
    var self = this;

    self._requireBuilt();
    if (! self.isAttached)
      throw new Error("Component not attached");

    var parent = self.parent;
    var A = self.firstNode();
    var B = self.lastNode();

    // We could be a root (and have no parent).  Parent could
    // theoretically be destroyed, or not yet built.
    if (parent && parent.stage === Component.BUILT) {
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

    // Move nodes into an offscreen div, preserving
    // any event handlers and data associated with the nodes.
    var div = makeSafeDiv();
    $(div).append(nodes);

    self._offscreen = div;
    self.isAttached = false;

    self.detached();
  },

  isEmpty: function () {
    this._requireBuilt();

    var start = this.start;
    return start === this.end && ! (start instanceof Component) &&
      start.nodeType === 8 && start[emptyCommentProp] === true;
  },

  attached: function () {},
  detached: function () {},

  extendHooks: {
    attached: 'chain',
    detached: 'chain',
    attributeHandlers: function (handlers) {
      this._attributeHandlers =
        _extend(_extend({}, this._attributeHandlers), handlers);
    }
  },

  destroyed: function () {
    // clean up any data associated with offscreen nodes
    if (this._offscreen)
      $.cleanData(this._offscreen.childNodes);

    // stop all computations (rebuilding and comp.autorun)
    var comps = this._computations;
    if (comps)
      for (var i = 0; i < comps.length; i++)
        comps[i].stop();
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

    if (! (before || parentNode))
      throw new Error("Need a Component or DOM node as arg 2 or 3");

    if (before instanceof Component) {
      before = before.firstNode();
      parentNode = before.parentNode;
    } else if (! before) {
      parentNode = (parentNode || self.parentNode());
    }

    parentNode = parentNode || before.parentNode;

    if (childOrDom instanceof Component) {
      var child = childOrDom;

      child._requireNotDestroyed();

      if (child.stage === Component.INITIAL) {
        self.add(child);
      } else if (child.parent !== self) {
        throw new Error("Can only append/prepend/insert" +
                        " a child (or a component addable as one)");
      }

      child.attach(parentNode, before);
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
    if (! (after || parentNode))
      throw new Error("Need a Component or DOM node as arg 2 or 3");

    if (after instanceof Component) {
      after = after.lastNode();
      parentNode = after.parentNode;
    }
    parentNode = parentNode || after.parentNode;

    this.insertBefore(childOrDom, after.nextSibling, parentNode);
  },

  containsElement: function (elem) {
    if (elem.nodeType !== 1)
      throw new Error("containsElement requires an Element node");

    var self = this;
    self._requireBuilt();

    var firstNode = self.firstNode();
    var prevNode = firstNode.previousSibling;
    var nextNode = self.lastNode().nextSibling;

    // element must not be "above" this component
    if (elementContains(elem, firstNode))
      return false;
    // element must not be "at or before" prevNode
    if (prevNode && compareElementIndex(prevNode, elem) >= 0)
      return false;
    // element must not be "at or after" nextNode
    if (nextNode && compareElementIndex(elem, nextNode) >= 0)
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
    // XXX linear-time scan through all children,
    // running DOM comparison methods that may themselves
    // be O(N).  Not sure what the constants are.
    for (var k in children) {
      var child = children[k];
      if (child.stage === Component.BUILT &&
          child.isAttached) {
        var found = child.findByElement(elem);
        if (found)
          return found;
      }
    }

    return self;
  },

  $: function (selector) {
    var self = this;

    self._requireBuilt();

    var firstNode = self.firstNode();
    var parentNode = firstNode.parentNode;
    var prevNode = firstNode.previousSibling;
    var nextNode = self.lastNode().nextSibling;

    // Don't assume `results` has jQuery API; a plain array
    // should do just as well.  However, if we do have a jQuery
    // array, we want to end up with one also.
    var results = $(selector, self.parentNode());

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
  },

  autorun: function (compFunc) {
    var self = this;

    self._requireNotDestroyed();

    var c = Deps.autorun(compFunc);

    self._computations = self._computations || [];
    self._computations.push(c);

    return c;
  },

  replaceChild: function (oldChild, newChild) {
    var self = this;

    self._requireBuilt();
    oldChild._requireBuilt();
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
    oldChild._requireBuilt();
    if (! oldChild.isAttached)
      throw new Error("Child to swap out must be attached");

    var lastNode = oldChild.lastNode();
    var parentNode = lastNode.parentNode;
    var nextNode = lastNode.nextSibling;

    oldChild.detach();
    self.insertBefore(newChild, nextNode, parentNode);
  },

  built: function () {
    var self = this;
    var cbs = self._builtCallbacks;
    if (cbs) {
      for (var i = 0, N = cbs.length; i < N; i++)
        cbs[i](self);
      self._builtCallbacks.length = 0;
    }
  },

  _onNextBuilt: function (cb) {
    var self = this;
    var cbs = self._builtCallbacks;
    if (! cbs)
      cbs = self._builtCallbacks = [];
    cbs.push(cb);
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
    for (var k in children)
      if (children[k].firstNode() === firstNode)
        return children[k];
    return null;
  },

  _findEndComponent: function (lastNode) {
    var children = parent.children;
    // linear-time scan until found
    for (var k in children)
      if (children[k].lastNode() === lastNode)
        return children[k];
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
  // and that the component does not become empty.
});

Component.include({
  attributeHandlers: {
    'class': AttributeHandler.extend({
      stringifyValue: function (value) {
        if (typeof value === 'string')
          return value;
        else if (typeof value.length === 'number') {
          return Array.prototype.join.call(value, ' ');
        } else {
          return String(value);
        }
      }
    })
  }
});

// Next up:
//
// - Spacebars compiler
// - event maps
// - preview HTML
// - Each for cursors, and for arrays
