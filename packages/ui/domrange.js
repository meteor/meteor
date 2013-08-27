UI = {};

var removeNode = function (n) {
//  if (n.nodeType === 1 &&
//      n.parentNode.$uihooks && n.parentNode.$uihooks.removeElement)
//    n.parentNode.$uihooks.removeElement(n);
//  else
    n.parentNode.removeChild(n);
};

var insertNode = function (n, parent, next) {
//  if (n.nodeType === 1 &&
//      parent.$uihooks && parent.$uihooks.insertElement)
//    parent.$uihooks.insertElement(n, parent, next);
//  else
    // `|| null` because IE throws an error if 'next' is undefined
    parent.insertBefore(n, next || null);
};

var moveNode = function (n, parent, next) {
//  if (n.nodeType === 1 &&
//      parent.$uihooks && parent.$uihooks.moveElement)
//    parent.$uihooks.moveElement(n, parent, next);
//  else
    // `|| null` because IE throws an error if 'next' is undefined
    parent.insertBefore(n, next || null);
};

var newFragment = function (nodeArray) {
  // jQuery fragments are built specially in
  // IE<9 so that they can safely hold HTML5
  // elements.
  return $.buildFragment(nodeArray, document);
};

// A very basic operation like Underscore's `_.extend` that
// copies `src`'s own, enumerable properties onto `tgt` and
// returns `tgt`.
var _extend = function (tgt, src) {
  for (var k in src)
    if (src.hasOwnProperty(k))
      tgt[k] = src[k];
  return tgt;
};

var isArray = function (x) {
  return !!((typeof x.length === 'number') &&
            (x.sort || x.splice));
};

// Text nodes consisting of only whitespace
// are "insignificant" nodes.
var isSignificantNode = function (n) {
  return ! (n.nodeType === 3 &&
            (! n.nodeValue ||
             /^\s+$/.test(n.nodeValue)));
};

var DomRange = function (component) {
  var start = document.createTextNode("");
  var end = document.createTextNode("");
  var fragment = newFragment([start, end]);

  if (component) {
    this.component = component;
    component.dom = this;
  } else {
    // self-host
    this.component = this;
    this.dom = this;
  }

  this.start = start;
  this.end = end;
  start.$ui = this.component;
  end.$ui = this.component;

  this.members = {};
  this.nextMemberId = 1;
  this.owner = null;
};

_extend(DomRange.prototype, {
  getNodes: function () {
    this.refresh();

    var afterNode = this.end.nextSibling;
    var nodes = [];
    for (var n = this.start;
         n && n !== afterNode;
         n = n.nextSibling)
      nodes.push(n);
    return nodes;
  },
  removeAll: function () {
    this.refresh();

    // leave start and end
    var afterNode = this.end;
    var nodes = [];
    for (var n = this.start.nextSibling;
         n && n !== afterNode;
         n = n.nextSibling) {
      // don't remove yet since then we'd lose nextSibling
      nodes.push(n);
    }
    for (var i = 0, N = nodes.length; i < N; i++)
      removeNode(nodes[i]);

    this.members = {};
  },
  // (_nextNode is internal)
  add: function (id, newMemberOrArray, beforeId, _nextNode) {
    if (id && typeof id !== 'string') {
      beforeId = newMemberOrArray;
      newMemberOrArray = id;
      id = null;
    }

    if (isArray(newMemberOrArray)) {
      if (id != null)
        throw new Error("Can only add one node or one component if id is given");
      var array = newMemberOrArray;
      // calculate `nextNode` once in case it involves a refresh
      _nextNode = this.getInsertionPoint(beforeId);
      for (var i = 0; i < array.length; i++)
        this.add(null, array[i], beforeId, _nextNode);
      return;
    }

    var parentNode = this.parentNode();
    // Consider ourselves removed (and don't mind) if
    // start marker has no parent.
    if (! parentNode)
      return;
    // because this may call `refresh`, it must be done
    // early, before we add the new member.
    var nextNode = (_nextNode ||
                    this.getInsertionPoint(beforeId));

    var newMember = newMemberOrArray;
    if (id == null)
      id = this.nextMemberId++;
    else
      id = '_' + id;

    var members = this.members;
    if (members.hasOwnProperty(id))
      throw new Error("Member already exists: " + id.slice(1));
    members[id] = newMember;

    if ('dom' in newMember) {
      if (! newMember.dom)
        throw new Error("Component not built");
      // Range
      var range = newMember.dom;
      range.owner = this.component;
      var nodes = range.getNodes();
      for (var i = 0; i < nodes.length; i++)
        insertNode(nodes[i], parentNode, nextNode);
    } else {
      // Node
      if (typeof newMember.nodeType !== 'number')
        throw new Error("Expected Component or Node");
      var node = newMember;
      node.$ui = this.component;
      insertNode(node, parentNode, nextNode);
    }
  },
  remove: function (id) {
    if (id == null) {
      // remove self
      this.removeAll();
      removeNode(this.start);
      removeNode(this.end);
      this.owner = null;
      return;
    }

    id = '_' + id;
    var members = this.members;
    var member = (members.hasOwnProperty(id) &&
                  members[id]);
    delete members[id];

    // Don't mind double-remove.
    if (! member)
      return;

    var parentNode = this.parentNode();
    // Consider ourselves removed (and don't mind) if
    // start marker has no parent.
    if (! parentNode)
      return;

    if ('dom' in member) {
      // Range
      var range = member.dom;
      range.owner = null;
      // Don't mind if range (specifically its start
      // marker) has been removed already.
      if (range.start.parentNode === parentNode)
        member.dom.remove();
    } else {
      // Node
      var node = member;
      // Don't mind if node has been removed already.
      if (node.parentNode === parentNode)
        removeNode(node);
    }
  },
  moveBefore: function (id, beforeId) {
    var nextNode = this.getInsertionPoint(beforeId);
    id = '_' + id;
    var members = this.members;
    var member =
          (members.hasOwnProperty(id) &&
           members[id]);
    // Don't mind if member doesn't exist.
    if (! member)
      return;

    var parentNode = this.parentNode();
    // Consider ourselves removed (and don't mind) if
    // start marker has no parent.
    if (! parentNode)
      return;

    if ('dom' in member) {
      // Range
      var range = member.dom;
      // Don't mind if range (specifically its start marker)
      // has been removed already.
      if (range.start.parentNode === parentNode) {
        range.refresh();
        var nodes = range.getNodes();
        for (var i = 0; i < nodes.length; i++)
          moveNode(nodes[i], parentNode, nextNode);
      }
    } else {
      // Node
      var node = member;
      moveNode(node, parentNode, nextNode);
    }
  },
  get: function (id) {
    id = '_' + id;
    var members = this.members;
    if (members.hasOwnProperty(id))
      return members[id];
    return null;
  },
  parentNode: function () {
    return this.start.parentNode;
  },
  startNode: function () {
    return this.start;
  },
  endNode: function () {
    return this.end;
  },
  eachMember: function (nodeFunc, rangeFunc) {
    var members = this.members;
    var parentNode = this.parentNode();
    for (var k in members) {
      // me, is a DomRange or node
      var mem = members[k];
      if ('dom' in mem) {
        // Range
        var range = mem.dom;
        if (range.start.parentNode === parentNode) {
          rangeFunc && rangeFunc(range); // still there
        } else {
          range.owner = null;
          delete members[k]; // gone
        }
      } else {
        // Node
        var node = mem;
        if (node.parentNode === parentNode)
          nodeFunc && nodeFunc(node); // still there
        else
          delete members[k]; // gone
      }
    }
  },

  ///////////// INTERNALS below this point, pretty much

  // The purpose of "refreshing" a DomRange is to
  // take into account any element removals or moves
  // that may have occurred, and to "fix" the start
  // and end markers before the entire range is moved
  // or removed so that they bracket the appropriate
  // content.
  //
  // For example, if a DomRange contains a single element
  // node, and this node is moved using jQuery, refreshing
  // the DomRange will look to the element as ground truth
  // and move the start/end markers around the element.
  // A refreshed DomRange's nodes may surround nodes from
  // sibling DomRanges (including their marker nodes)
  // until the sibling DomRange is refreshed.
  //
  // Specifically, `refresh` moves the `start`
  // and `end` nodes to immediate before the first,
  // and after the last, "significant" node the
  // DomRange contains, where a significant node
  // is any node except a whitespace-only text-node.
  // All member ranges are refreshed first.  Adjacent
  // insignificant member nodes are included between
  // `start` and `end` as well, but it's possible that
  // other insignificant nodes remain as siblings
  // elsewhere.  Nodes with no DomRange owner that are
  // found between this DomRange's nodes are adopted.
  //
  // Performing add/move/remove operations on an "each"
  // shouldn't require refreshing the entire each, just
  // the member in question.  (However, adding to the
  // end may require refreshing the whole "each";
  // see `getInsertionPoint`.  Adding multiple members
  // at once using `add(array)` is faster.
  refresh: function () {

    var someNode = null;
    var someRange = null;
    var numMembers = 0;
    // Assign a single unique "color" (an integer) to
    // our members and us to recognize them easily.
    this.eachMember(function (node) {
      someNode = node;
      numMembers++;
    }, function (range) {
      range.refresh();
      someRange = range;
      numMembers++;
    });

    var parentNode = this.parentNode();
    var firstNode = null;
    var lastNode = null;

    if (numMembers === 0) {
      // don't scan for members
    } else if (numMembers === 1) {
      if (someNode) {
        firstNode = someNode;
        lastNode = someNode;
      } else if (someRange) {
        firstNode = someRange.start;
        lastNode = someRange.end;
      }
    } else {
      // This loop is O(childNodes.length), even if our members
      // are already consecutive.  This means refreshing just one
      // item in a list is technically order of the total number
      // of siblings, including in other list items.
      //
      // The root cause is we intentionally don't track the
      // DOM order of our members, so finding the first
      // and last in sibling order either involves a scan
      // or a bunch of calls to compareDocumentPosition.
      //
      // Fortunately, the common cases of zero and one members
      // are optimized.  Also, the scan is super-fast because
      // no work is done for unknown nodes.  It could be possible
      // to optimize this code further if it becomes a problem.
      for (var node = parentNode.firstChild;
           node; node = node.nextSibling) {

        var nodeOwner;
        if (node.$ui &&
            (nodeOwner = node.$ui.dom) &&
            ((nodeOwner === this &&
              node !== this.start &&
              node !== this.end &&
              isSignificantNode(node)) ||
             (nodeOwner !== this &&
              nodeOwner.owner &&
              nodeOwner.owner.dom === this &&
              nodeOwner.start === node))) {
          // found a member range or node
          // (excluding "insignificant" empty text nodes,
          // which won't be moved by, say, jQuery)
          if (firstNode) {
            // if we've already found a member in our
            // scan, see if there are some easy ownerless
            // nodes to "adopt" by scanning backwards.
            for (var n = firstNode.previousSibling;
                 n && ! n.$ui;
                 n = n.previousSibling) {
              this.members[this.nextMemberId++] = n;
              n.$ui = this.component;
            }
          }
          if (node.$ui.dom === this) {
            // Node
            firstNode = (firstNode || node);
            lastNode = node;
          } else {
            // Range
            // skip it and include its nodes in
            // firstNode/lastNode.
            firstNode = (firstNode || node);
            node = node.$ui.dom.end;
            lastNode = node;
          }
        }
      }
    }
    if (firstNode) {
      // some member or significant node was found.
      // expand to include our insigificant member
      // nodes as well.
      for (var n;
           (n = firstNode.previousSibling) &&
           n.$ui && n.$ui.dom === this;)
        firstNode = n;
      for (var n;
           (n = lastNode.nextSibling) &&
           n.$ui && n.$ui.dom === this;)
        lastNode = n;
      // adjust our start/end pointers
      if (firstNode !== this.start)
        insertNode(this.start,
                   parentNode, firstNode);
      if (lastNode !== this.end)
        insertNode(this.end, parentNode,
                 lastNode.nextSibling);
    }
  },
  getInsertionPoint: function (beforeId) {
    var members = this.members;
    var parentNode = this.parentNode();

    if (! beforeId) {
      // Refreshing here is necessary if we want to
      // allow elements to move around arbitrarily.
      // If jQuery is used to reorder elements, it could
      // easily make our `end` pointer meaningless,
      // even though all our members continue to make
      // good reference points as long as they are refreshed.
      //
      // However, a refresh is expensive!  Let's
      // make the developer manually refresh if
      // elements are being re-ordered externally.
      return this.end;
    }

    beforeId = '_' + beforeId;
    var mem = members[beforeId];

    if ('dom' in mem) {
      // Range
      var range = mem.dom;
      if (range.start.parentNode === parentNode) {
        // still there
        range.refresh();
        return range.start;
      } else {
        range.owner = null;
      }
    } else {
      // Node
      var node = mem;
      if (node.parentNode === parentNode)
        return node; // still there
    }

    // not there anymore
    delete members[beforeId];
    // no good position
    return this.end;
  }
});

// In a real-life case where you need a refresh,
// you probably don't have easy
// access to the appropriate DomRange or component,
// just the enclosing element:
//
// ```
// {{#Sortable}}
//   <div>
//     {{#each}}
//       ...
// ```
//
// In this case, Sortable wants to call `refresh`
// on the div, not the each, so it would use this function.
DomRange.refresh = function (element) {
  var topLevelRanges = [];
  for (var n = element.firstChild;
       n; n = n.nextSibling) {
    if (n.$ui && n === n.$ui.dom.start &&
        ! n.$ui.dom.owner)
      topLevelRanges.push(n.$ui.dom);
  }

  for (var i = 0, N = topLevelRanges.length;
       i < N; i++)
    topLevelRanges[i].refresh();
};

UI.DomRange = DomRange;