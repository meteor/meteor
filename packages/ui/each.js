
//////////////////////////////

// We probably want to instrument insertNode/
// removeNode to record who added a node,
// for the purpose of event handling, and also
// to notify any jQuery widgets on an element
// that care about elements coming and going.

var removeNode = function (n) {
  n.parentNode.removeChild(n);
};

var insertNode = function (n, parent, next) {
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

DomRange = function () {
  var start = document.createTextNode("");
  var end = document.createTextNode("");
  var fragment = newFragment([start, end]);

  this.start = start;
  this.end = end;
  start.$ui = this;
  end.$ui = this;

  // XXX Use a different term than "child" to avoid
  // confusion?  e.g. "item" or "owned"
  this.children = {};
  this.nextChildId = 1;
};

_extend(DomRange.prototype, {
  parentNode: function () {
    return this.start.parentNode;
  },
  eachChild: function (nodeFunc, rangeFunc) {
    var children = this.children;
    var parentNode = this.parentNode();
    for (var k in children) {
      // x is a DomRange or node
      var x = children[k];
      if (x.parentNode === parentNode) {
        // node, still there
        nodeFunc && nodeFunc(x);
      } else if (x.start &&
                 x.start.parentNode === parentNode) {
        // DomRange, still there
        rangeFunc && rangeFunc(x);
      } else {
        // not there anymore
        delete children[k];
      }
    }
  },
  // "Refreshing" a DomRange moves the `start`
  // and `end` nodes to immediate before the first,
  // and after the last, "significant" node the
  // DomRange contains, where a significant node
  // is any node except a whitespace-only text-node.
  // All child ranges are refreshed first.  Adjacent
  // insignificant child nodes are included between
  // `start` and `end` as well, but it's possible that
  // other insignificant nodes remain as siblings
  // elsewhere.  Nodes with no DomRange owner that are
  // found between this DomRange's nodes are adopted.
  //
  // Performing add/move/remove operations on an "each"
  // shouldn't require refreshing the entire each, just
  // the item in question.
  refresh: function () {
    var color = nextColor++;
    this.color = color;

    this.eachChild(null, function (range) {
      range.refresh();
      range.color = color;
    });

    // XXX optimize this so if significant
    // children are consecutive (ignoring
    // intervening insignificant nodes),
    // it isn't O(childNodes.length).
    var parentNode = this.parentNode();
    var firstNode = null;
    var lastNode = null;
    var inChild = null;
    for (var node = parentNode.firstChild;
         node; node = node.nextSibling) {
      if (inChild && node === inChild.end) {
        inChild = null;
        continue;
      }

      if ((inChild || (
        node.$ui === this &&
          node !== this.start &&
          node !== this.end)) &&
          isSignificantNode(node)) {
        if (firstNode) {
          for (var n = firstNode.previousSibling;
               n && ! n.$ui;
               n = n.previousSibling) {
            // adopt node
            this.children[this.nextChildId++] = n;
            n.$ui = this;
          }
        }
        firstNode = (firstNode || node);
        lastNode = node;
      }

      if (! inChild && node.$ui &&
          node.$ui !== this &&
          node.$ui.color === color &&
          node.$ui.start === node)
        inChild = node.$ui;
    }
    if (firstNode) {
      // some significant node found
      for (var n;
           (n = firstNode.previousSibling) &&
           n.$ui && n.$ui.color === color;)
        firstNode = n;
      for (var n;
           (n = lastNode.nextSibling) &&
           n.$ui && n.$ui.color === color;)
        lastNode = n;

      if (firstNode !== this.start)
        insertNode(this.start,
                   parentNode, firstNode);
      if (lastNode !== this.end)
        insertNode(this.end, parentNode,
                 lastNode.nextSibling);
    } else {
      firstNode = this.start;
      lastNode = this.end;
      if (firstNode.nextSibling !== lastNode)
        insertNode(lastNode, parentNode,
                   firstNode.nextSibling);
    }
  },

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
         n = n.nextSibling)
      removeNode(n);

    this.children = {};
  },
  getInsertionPoint: function (beforeId) {
    var children = this.children;
    var parentNode = this.parentNode();

    if (! beforeId)
      return this.end;

    beforeId = '_' + beforeId;
    var x = children[beforeId];

    if (x.parentNode === parentNode) {
      // node, still there
      return x;
    } else if (x.start &&
               x.start.parentNode === parentNode) {
      // DomRange, still there
      x.refresh();
      return x.start;
    } else {
      // not there anymore
      delete children[beforeId];
      return this.end;
    }
  },
  add: function (id, rangeNodeOrContent, beforeId) {
    if (id && typeof id !== 'string') {
      beforeId = rangeNodeOrContent;
      rangeNodeOrContent = id;
      id = null;
    }

    if (isArray(rangeNodeOrContent)) {
      if (id != null)
        throw new Error("Can only add one node or one range if id is given");
      var content = rangeNodeOrContent;
      for (var i = 0; i < content.length; i++)
        this.add(content[i], beforeId);
      return;
    }

    var rangeOrNode = rangeNodeOrContent;
    if (id == null)
      id = this.nextChildId++;
    else
      id = '_' + id;

    var children = this.children;
    if (children.hasOwnProperty(id))
      throw new Error("Item already exists: " + id.slice(1));
    children[id] = rangeOrNode;

    var parentNode = this.parentNode();
    if (! parentNode)
      return;
    var nextNode = this.getInsertionPoint(beforeId);

    if (typeof rangeOrNode.getNodes === 'function') {
      // DomRange
      var nodes = rangeOrNode.getNodes();
      for (var i = 0; i < nodes.length; i++)
        insertNode(nodes[i], parentNode, nextNode);
    } else {
      // node
      rangeOrNode.$ui = this;
      insertNode(rangeOrNode, parentNode, nextNode);
    }
  },
  remove: function (id) {
    if (id == null) {
      // remove self
      this.removeAll();
      removeNode(this.start);
      return;
    }

    id = '_' + id;
    var children = this.children;
    var rangeOrNode =
          (children.hasOwnProperty(id) &&
           children[id]);
    delete children[id];
    if (! rangeOrNode)
      return;

    var parentNode = this.parentNode();
    if (! parentNode)
      return;

    if (rangeOrNode.parentNode === parentNode) {
      // node
      removeNode(rangeOrNode);
    } else if (rangeOrNode.start &&
               rangeOrNode.start.parentNode === parentNode) {
      // DomRange
      rangeOrNode.remove();
    }
  },
  moveBefore: function (id, beforeId) {
    var nextNode = this.getInsertionPoint(beforeId);
    id = '_' + id;
    var children = this.children;
    var rangeOrNode =
          (children.hasOwnProperty(id) &&
           children[id]);
    if (! rangeOrNode)
      return;

    var parentNode = this.parentNode();
    if (! parentNode)
      return;


    if (rangeOrNode.parentNode === parentNode) {
      // node
      insertNode(rangeOrNode, parentNode, nextNode);
    } else if (rangeOrNode.start &&
               rangeOrNode.start.parentNode === parentNode) {
      // DomRange
      rangeOrNode.refresh();
      var nodes = rangeOrNode.getNodes();
      for (var i = 0; i < nodes.length; i++)
        insertNode(nodes[i], parentNode, nextNode);
    }
  },
  get: function (id) {
    id = '_' + id;
    var children = this.children;
    if (children.hasOwnProperty(id))
      return children[id];
    return null;
  }
});

////////////////////

UI.Each = Component.extend({
  typeName: 'Each',
  render: function (buf) {
    // do nothing
  },
  rendered: function () {
    var self = this;

    var cursor = self.get();

    var content =
          (typeof self.content === 'function' ?
           self.content() : self.content)
          || UI.Empty;

    var range = new DomRange;
    // text nodes here are to avoid problems
    // from old start/end tracking
    self.append(document.createTextNode(""));
    self.append(range.getNodes());
    self.append(document.createTextNode(""));

    cursor.observe({
      _no_indices: true,
      addedAt: function (doc, i, beforeId) {
        var id = LocalCollection._idStringify(doc._id);

        var data = doc;
        var dep = new Deps.Dependency;
        var comp = content.withData(_extend(
          function () {
            dep.depend();
            return data;
          }, {
            $set: function (v) {
              data = v;
              dep.changed();
            }}));

        self.add(comp);
        comp.build();
        var r = new DomRange;
        r.component = comp;
        // XXX emulate hypothetical
        // node.$ui.data() API
        r.data = function () {
          return data;
        };
        r.add(_.toArray(
          comp._offscreen.childNodes));
        comp._offscreen = null;
        comp.isAttached = true;

        if (beforeId)
          beforeId = LocalCollection._idStringify(beforeId);
        range.add(id, r, beforeId);
      },
      removed: function (doc) {
        range.remove(LocalCollection._idStringify(doc._id));
      },
      movedTo: function (doc, i, j, beforeId) {
        range.moveBefore(
          LocalCollection._idStringify(doc._id),
          beforeId && LocalCollection._idStringify(beforeId));
      },
      changed: function (newDoc) {
        range.get(LocalCollection._idStringify(newDoc._id)).component.data.$set(newDoc);
      }
    });
  }
});
