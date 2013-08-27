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

var nextColor = 1;

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
    _.each(nodes, removeNode);

    this.members = {};
  },
  add: function (id, newMemberOrArray, beforeId) {
    if (id && typeof id !== 'string') {
      beforeId = newMemberOrArray;
      newMemberOrArray = id;
      id = null;
    }

    if (isArray(newMemberOrArray)) {
      if (id != null)
        throw new Error("Can only add one node or one component if id is given");
      var array = newMemberOrArray;
      for (var i = 0; i < array.length; i++)
        this.add(array[i], beforeId);
      return;
    }

    var newMember = newMemberOrArray;
    if (id == null)
      id = this.nextMemberId++;
    else
      id = '_' + id;

    var members = this.members;
    if (members.hasOwnProperty(id))
      throw new Error("Member already exists: " + id.slice(1));
    members[id] = newMember;

    var parentNode = this.parentNode();
    // Consider ourselves removed (and don't mind) if
    // start marker has no parent.
    if (! parentNode)
      return;
    var nextNode = this.getInsertionPoint(beforeId);

    if ('dom' in newMember) {
      if (! newMember.dom)
        throw new Error("Component not built");
      // Range
      var range = newMember.dom;
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
    // does not refresh.
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
        if (range.start.parentNode === parentNode)
          rangeFunc && rangeFunc(range); // still there
        else
          delete members[k]; // gone
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
  // the member in question.
  refresh: function () {
    var color = nextColor++;
    this.color = color;

    this.eachMember(null, function (range) {
      range.refresh();
      range.color = color;
    });

    // XXX optimize this so if significant
    // members are consecutive (ignoring
    // intervening insignificant nodes),
    // it isn't O(childNodes.length).
    var parentNode = this.parentNode();
    var firstNode = null;
    var lastNode = null;
    var memberRangeIn = null;
    for (var node = parentNode.firstChild;
         node; node = node.nextSibling) {
      if (memberRangeIn && node === memberRangeIn.end) {
        memberRangeIn = null;
        continue;
      }

      if ((memberRangeIn || (
        node.$ui.dom === this &&
          node !== this.start &&
          node !== this.end)) &&
          isSignificantNode(node)) {
        if (firstNode) {
          for (var n = firstNode.previousSibling;
               n && ! n.$ui;
               n = n.previousSibling) {
            // adopt node
            this.members[this.nextMemberId++] = n;
            n.$ui = this.component;
          }
        }
        firstNode = (firstNode || node);
        lastNode = node;
      }

      if (! memberRangeIn && node.$ui &&
          node.$ui.dom !== this &&
          node.$ui.dom.color === color &&
          node.$ui.dom.start === node)
        memberRangeIn = node.$ui.dom;
    }
    if (firstNode) {
      // some significant node found.
      // expand to include other nodes we recognize.
      for (var n;
           (n = firstNode.previousSibling) &&
           n.$ui && n.$ui.dom.color === color;)
        firstNode = n;
      for (var n;
           (n = lastNode.nextSibling) &&
           n.$ui && n.$ui.dom.color === color;)
        lastNode = n;

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

    if (! beforeId)
      return this.end;

    beforeId = '_' + beforeId;
    var mem = members[beforeId];

    if ('dom' in mem) {
      // Range
      var range = mem.dom;
      if (range.start.parentNode === parentNode) {
        // still there
        range.refresh();
        return range.start;
      }
    } else {
      // Node
      var node = mem;
      if (node.parentNode === parentNode)
        return node; // still there
    }

    // not there anymore
    delete members[beforeId];
    return this.end;
  }
});

UI.DomRange = DomRange;