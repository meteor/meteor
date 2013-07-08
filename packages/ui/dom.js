var Component = UIComponent;

var emptyCommentProp = 'meteor-ui-empty';
var createEmptyComment = function (beforeNode) {
  var x = document.createComment("empty");
  x[emptyCommentProp] = true;
  return x;
};

var findChildWithFirstNode = function (parent, firstNode) {
  var children = parent.children;
  // linear scan until found
  for (var k in children)
    if (children[k].firstNode() === firstNode)
      return children[k];
  return null;
};

var findChildWithLastNode = function (parent, lastNode) {
  var children = parent.children;
  // linear scan until found
  for (var k in children)
    if (children[k].lastNode() === lastNode)
      return children[k];
  return null;
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

var insertNodesBefore = function (nodes, parentNode, beforeNode) {
  if (beforeNode) {
    $(nodes).insertBefore(beforeNode);
  } else {
    $(nodes).appendTo(parentNode);
  }
};

var htmlToFragment = function (html) {
  // When jQuery parses HTML into an array of nodes, the nodes all
  // tend to reside in a DocumentFragment if there are two or more
  // of them, but no fragment is created if there are 0 or 1.
  //
  // If we need to create a DocumentFragment ourselves, we still want
  // jQuery to actually do it because it has tricks to create a "safe"
  // fragment for HTML5 tags in IE <9.

  var nodes = $.parseHTML(html) || [];

  var a, b;

  if (nodes.length === 0) {
    return $.buildFragment([], document);
  } else if ((a = nodes[0].parentNode) && a.nodeType === 11 &&
             (b = nodes[nodes.length - 1]) && b.nodeType === 11 &&
             a === b) {
    return a;
  } else {
    return $.buildFragment(nodes, nodes[0].ownerDocument);
  }
};

Component({
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

  // DocumentFragment (if component is BUILT and not attached).
  _offscreenFragment: null,

  render: function (buf) {},

  _buildFragment: function () {
    var self = this;

    var strs = [];
    var randomString = Random.id();
    var commentUid = 1;
    var componentsToAttach = {};

    self.render(function (/*args*/) {
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (typeof arg === 'string') {
          strs.push(arg);
        } else if (arg instanceof Component) {
          var commentString = randomString + '_' + (commentUid++);
          strs.push('<!--', commentString, '-->');
          self.add(arg);
          componentsToAttach[commentString] = arg;
        } else {
          throw new Error("Expected string or Component");
        }
      }
    });

    var html = strs.join('');

    var frag = htmlToFragment(html);
    var start = frag.firstChild;
    var end = frag.lastChild;

    // walk frag and replace comments with Components

    var wireUpDOM = function (parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 8) { // COMMENT
          var comp = componentsToAttach[n.nodeValue];
          if (comp) {
            if (parent === frag) {
              if (n === frag.firstChild)
                start = comp;
              if (n === frag.lastChild)
                end = comp;
            }
            comp.attach(parent, n);
            parent.removeChild(n);
          }
        } else if (n.nodeType === 1) { // ELEMENT
          // recurse through DOM
          wireUpDOM(n);
        }
        n = next;
      }
    };

    wireUpDOM(frag);

    return {
      fragment: frag,
      // start and end will both be null if frag is empty
      start: start,
      end: end
    };
  },

  build: function () {
    var self = this;

    self._requireNotDestroyed();
    if (self.stage === Component.BUILT)
      throw new Error("Component already built");
    if (self.stage !== Component.ADDED)
      throw new Error("Component must be added to a parent (or made a root) before building");

    var info = self._buildFragment();
    var frag = info.fragment;
    if (! frag.firstChild)
      frag.appendChild(createEmptyComment());

    self._offscreenFragment = frag;
    self.start = info.start || frag.firstChild;
    self.end = info.end || frag.lastChild;

    self._built();
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

    insertNodesBefore(self._offscreenFragment.childNodes,
                      parentNode, beforeNode);

    self._offscreenFragment = null;
    self.isAttached = true;

    var parent = self.parent;
    // We could be a root (and have no parent).  Parent could
    // theoretically be destroyed, or not yet built.
    if (parent && parent.stage === Component.BUILT) {
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
          parent.start = (
            findChildWithFirstNode(parent, newFirstNode) || newFirstNode);
        }
      } else if (parent.end === self) {
        // Removing component at the end of parent.
        //
        // Figure out if the previous top-level node is the
        // last node of a Component.
        var newLastNode = A.previousSibling;
        parent.end = (
          findChildWithLastNode(parent, newLastNode) || newLastNode);
      }
    }

    var nodes = [];
    for (var n = A; n !== B; n = n.nextSibling)
      nodes.push(n);
    nodes.push(B);

    // Put nodes into a DocumentFragment created by jQuery, preserving
    // any event handlers and data associated with the nodes.
    var frag = $.buildFragment(nodes, nodes[0].ownerDocument);

    self._offscreenFragment = frag;
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
    detached: 'chain'
  },

  destroyed: function () {
    // clean up any data associated with offscreen nodes
    if (this._offscreenFragment)
      $.cleanData(this._offscreenFragment.childNodes);
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
        insertNodesBefore(nodes, before, parentNode);

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
  }

  // Reactive building:
  //
  // * Perhaps factor out into a `_rebuild` method.
  //   - Destroys, then removes, each child
  // * There should be some natural way for the autorun
  //   to die with the Component.  One solution is to
  //   have `self.autorun`, which performs an autorun
  //   that stops when the component is destroyed.  Note
  //   that autoruns nested inside the `build` autorun
  //   will (additionally) stop on rebuild, as they
  //   should.

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