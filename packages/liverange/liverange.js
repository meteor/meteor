// Stand back, I'm going to try SCIENCE.

// Possible optimization: get rid of _startIndex/_endIndex and just search
// the list. Not clear which strategy will be faster.

// Possible extension: could allow zero-length ranges is some cases,
// by encoding both 'enter' and 'leave' type events in the same list

var canSetTextProps = (function () {
  // IE8 and earlier don't support expando attributes on text nodes,
  // but fortunately they are allowed on comments.
  var testElem = document.createTextNode("");
  var exception;
  try {
    testElem.test = 123;
  } catch (exception) { }
  if (testElem.test !== 123)
    return false;

  // IE9 and 10 have a weird issue with multiple text nodes next to
  // each other losing their expando attributes. Use the same
  // workaround as IE8. Not sure how to test this as a feature, so use
  // browser detection instead.
  // See https://github.com/meteor/meteor/issues/458
  if (document.documentMode)
    return false;

  return true;
})();

var wrapEndpoints = function (start, end) {
  if (canSetTextProps) {
    return [start, end];
  } else {
    // IE8 workaround: insert some empty comments.
    // Comments whose text is "IE" are stripped out
    // in cross-browser testing.
    if (start.nodeType === 3 /* text node */) {
      var placeholder = document.createComment("IE");
      start.parentNode.insertBefore(placeholder, start);
      start = placeholder;
    }
    if (end.nodeType === 3 /* text node */) {
      var placeholder = document.createComment("IE");
      end.parentNode.insertBefore(placeholder, end.nextSibling);
      end = placeholder;
    }
    return [start, end];
  }
};


// This is a constructor (invoke it as 'new LiveRange').
//
// Create a range, tagged 'tag', that includes start, end, and all
// the nodes between them, and the children of all of those nodes,
// but includes no other nodes. If there are other ranges tagged
// 'tag' that contain this exact set of nodes, then: if inner is
// false (the default), the new range will be outside all of them
// (will contain all of them), or if inner is true, then it will be
// inside all of them (be contained by all of them.) If there are no
// other ranges tagged 'tag' that contain this exact set of nodes,
// then 'inner' is ignored because the nesting of the new range with
// respect to other ranges is uniquely determined. (Nesting of
// ranges with different tags is undefined.)
//
// To track the range as it's relocated, some of the DOM nodes that
// are part of the range will have an expando attribute set on
// them. The name of the expando attribute will be the value of
// 'tag', so pick something that won't collide.
//
// Instead of start and end, you can pass a document or
// documentfragment for start and leave end undefined. Or you can
// pass a node for start and leave end undefined, in which case end
// === start. If start and end are distinct nodes, they must be
// siblings.
//
// You can set any attributes you like on the returned LiveRange
// object, with two exceptions. First, attribute names that start
// with '_' are reserved. Second, the attribute 'tag' contains the
// tag name of this range and mustn't be changed.
//
// It would be possible to add a fast path through this function
// when caller can promise that there is no range that starts on
// start that does not end by end, and vice versa. eg: when start
// and end are the first and last child of their parent respectively
// or when caller is building up the range tree from the inside
// out. Let's wait for the profiler to tell us to add this.
//
// XXX Should eventually support LiveRanges where start === end
// and start.parentNode is null.
LiveRange = function (tag, start, end, inner) {
  if (start.nodeType === 11 /* DocumentFragment */) {
    end = start.lastChild;
    start = start.firstChild;
  } else {
    if (! start.parentNode)
      throw new Error("LiveRange start and end must have a parent");
  }
  end = end || start;

  this.tag = tag; // must be set before calling _ensureTag

  var endpoints = wrapEndpoints(start, end);
  start = this._ensureTag(endpoints[0]);
  end = this._ensureTag(endpoints[1]);

  // Decide at what indices in start[tag][0] and end[tag][1] we
  // should insert the new range.
  //
  // The start[tag][0] array lists the other ranges that start at
  // `start`, and we must choose an insertion index that puts us
  // inside the ones that end at later siblings, and outside the ones
  // that end at earlier siblings.  The ones that end at the same
  // sibling (i.e. share both our start and end) we must be inside
  // or outside of depending on `inner`.  The array lists ranges
  // from the outside in.
  //
  // The same logic applies to end[tag][1], which lists the other ranges
  // that happen to end at `end` from in the inside out.
  //
  // Liveranges technically start just before, and end just after, their
  // start and end nodes to which the liverange data is attached.

  var startIndex = findPosition(start[tag][0], true, end, start, inner);
  var endIndex = findPosition(end[tag][1], false, start, end, inner);

  // this._start is the node N such that we begin before N, but not
  // before the node before N in the preorder traversal of the
  // document (if there is such a node.) this._start[this.tag][0]
  // will be the list of all LiveRanges for which this._start is N,
  // including us, sorted in the order that the ranges start. and
  // finally, this._startIndex is the value such that
  // this._start[this.tag][0][this._startIndex] === this.
  //
  // Similarly for this._end, except it's the node N such that we end
  // after N, but not after the node after N in the postorder
  // traversal; and the data is stored in this._end[this.tag][1], and
  // it's sorted in the order that the ranges end.

  // Set this._start, this._end, this._startIndex, this._endIndex
  this._insertEntries(start, 0, startIndex, [this]);
  this._insertEntries(end, 1, endIndex, [this]);
};

var findPosition = function(ranges, findEndNotStart, edge, otherEdge, inner) {
  var index;
  // For purpose of finding where we belong in start[tag][0],
  // walk the array and determine where we start to see ranges
  // end at `end` (==edge) or earlier.  For the purpose of finding
  // where we belong in end[tag][1], walk the array and determine
  // where we start to see ranges start at `start` (==edge) or
  // earlier.  In both cases, we slide a sibling pointer backwards
  // looking for `edge`, though the details are slightly different.
  //
  // Use `inner` to take first or last candidate index for insertion.
  // Candidate indices are:  Right before a range whose edge is `edge`
  // (i.e., a range with same start and end as we are creating),
  // or the index where ranges start to have edges earlier than `edge`
  // (treating the end of the list as such an index).  We detect the
  // latter case when `n` hits `edge` without hitting the edge of the
  // current range; that is, it is about to move past `edge`.  This is
  // always an appropriate time to stop.
  //
  // Joint traversal of the array and DOM should be fast.  The most
  // expensive thing to happen would be a single walk from lastChild
  // to end looking for range ends, or from end to start looking for
  // range starts.
  //
  // invariant: n >= edge ("n is after, or is, edge")
  var initialN = (findEndNotStart ? edge.parentNode.lastChild : otherEdge);
  var takeFirst = (findEndNotStart ? ! inner : inner);
  for(var i=0, n=initialN; i<=ranges.length; i++) {
    var r = ranges[i];
    var curEdge = r && (findEndNotStart ? r._end : r._start);
    while (n !== curEdge && n !== edge) {
      n = n.previousSibling;
    }
    if (curEdge === edge) {
      index = i;
      if (takeFirst) break;
    } else if (n === edge) {
      index = i;
      break;
    }
  }
  return index;
};

LiveRange.prototype._ensureTag = function (node) {
  if (!(this.tag in node))
    node[this.tag] = [[], []];
  return node;
};

var canDeleteExpandos = (function() {
  // IE7 can't remove expando attributes from DOM nodes with
  // delete. Instead you must remove them with node.removeAttribute.
  var node = document.createElement("DIV");
  var exception;
  var result = false;
  try {
    node.test = 12;
    delete node.test;
    result = true;
  } catch (exception) { }
  return result;
})();

LiveRange._cleanNode = function (tag, node, force) {
  var data = node[tag];
  if (data && (!(data[0].length + data[1].length) || force)) {
    if (canDeleteExpandos)
      delete node[tag];
    else
      node.removeAttribute(tag);
  }
};

// Delete a LiveRange. This is analogous to removing a DOM node from
// its parent -- it will no longer appear when traversing the tree
// with visit().
//
// On modern browsers there is no requirement to delete LiveRanges on
// defunct nodes. They will be garbage collected just like any other
// object. However, on old versions of IE, you probably do need to
// manually remove all ranges because IE can't GC reference cycles
// through the DOM.
//
// Pass true for `recursive` to also destroy all descendent ranges.
LiveRange.prototype.destroy = function (recursive) {
  var self = this;

  if (recursive) {
    // recursive case: destroy all descendent ranges too
    // (more efficient than actually recursing)

    this.visit(function(isStart, range) {
      if (isStart) {
        range._start = null;
        range._end = null;
      }
    }, function(isStart, node) {
      if (! isStart) {
        // when leaving a node, force-clean its children
        for(var n = node.firstChild; n; n = n.nextSibling) {
          LiveRange._cleanNode(self.tag, n, true);
        }
      }
    });

    this._removeEntries(this._start, 0, this._startIndex);
    this._removeEntries(this._end, 1, 0, this._endIndex + 1);

    if (this._start !== this._end) {
      // force-clean the top-level nodes in this, besides _start and _end
      for(var n = this._start.nextSibling;
          n !== this._end;
          n = n.nextSibling) {
        LiveRange._cleanNode(self.tag, n, true);
      }

      // clean ends on this._start and starts on this._end
      if (this._start[self.tag])
        this._removeEntries(this._start, 1);
      if (this._end[self.tag])
        this._removeEntries(this._end, 0);
    }

    this._start = this._end = null;

  } else {
    this._removeEntries(this._start, 0, this._startIndex, this._startIndex + 1);
    this._removeEntries(this._end, 1, this._endIndex, this._endIndex + 1);
    this._start = this._end = null;
  }
};

// Return the first node in the range (in preorder traversal)
LiveRange.prototype.firstNode = function () {
  return this._start;
};

// Return the last node in the range (in postorder traversal)
LiveRange.prototype.lastNode = function () {
  return this._end;
};

// Return the node that immediately contains this LiveRange, that is,
// the parentNode of firstNode and lastNode.
LiveRange.prototype.containerNode = function() {
  return this._start.parentNode;
};

// Walk through the current contents of a LiveRange, enumerating
// either the contained ranges (with the same tag as this range),
// the contained elements, or both.
//
// visitRange(isStart, range) is invoked for each range
// start-point or end-point that we encounter as we walk the range
// stored in 'this' (not counting the endpoints of 'this' itself.)
// visitNode(isStart, node) is similar but for nodes.  Both
// functions are optional.
//
// If you return false (i.e. a value === false) from visitRange
// or visitNode when isStart is true, the children of that range
// or node are skipped, and the next callback will be the same
// range or node with isStart false.
//
// If you create or destroy ranges with this tag from a visitation
// function, results are undefined!
LiveRange.prototype.visit = function(visitRange, visitNode) {
  visitRange = visitRange || function() {};
  visitNode = visitNode || function() {};

  var tag = this.tag;

  var recurse = function(start, end, startRangeSkip) {
    var startIndex = startRangeSkip || 0;
    var after = end.nextSibling;
    for(var n = start; n && n !== after; n = n.nextSibling) {
      var startData = n[tag] && n[tag][0];
      if (startData && startIndex < startData.length) {
        // immediate child range that starts with n
        var range = startData[startIndex];
        // be robust if visitRange mutates _start or _end;
        // useful in destroy(true)
        var rangeStart = range._start;
        var rangeEnd = range._end;
        if (visitRange(true, range) !== false)
          recurse(rangeStart, rangeEnd, startIndex+1);
        visitRange(false, range);
        n = rangeEnd;
      } else {
        // bare node
        if (visitNode(true, n) !== false && n.firstChild)
          recurse(n.firstChild, n.lastChild);
        visitNode(false, n);
      }
      startIndex = 0;
    }
  };

  recurse(this._start, this._end, this._startIndex + 1);
};

// startEnd === 0 for starts, 1 for ends
LiveRange.prototype._removeEntries =
  function(node, startEnd, i, j)
{
  var entries = node[this.tag][startEnd];
  i = i || 0;
  j = (j || j === 0) ? j : entries.length;
  var removed = entries.splice(i, j-i);
  // fix up remaining ranges (not removed ones)
  for(var a = i; a < entries.length; a++) {
    if (startEnd) entries[a]._endIndex = a;
    else entries[a]._startIndex = a;
  }

  // potentially remove empty liverange data
  if (! entries.length) {
    LiveRange._cleanNode(this.tag, node);
  }

  return removed;
};

LiveRange.prototype._insertEntries =
  function(node, startEnd, i, newRanges)
{
  // insert the new ranges and "adopt" them by setting node pointers
  var entries = node[this.tag][startEnd];
  Array.prototype.splice.apply(entries, [i, 0].concat(newRanges));
  for(var a=i; a < entries.length; a++) {
    if (startEnd) {
      entries[a]._end = node;
      entries[a]._endIndex = a;
    } else {
      entries[a]._start = node;
      entries[a]._startIndex = a;
    }
  }
};

// Replace the contents of this range with the provided
// DocumentFragment. Returns the previous contents as a
// DocumentFragment.
//
// "The right thing happens" with child LiveRanges:
// - If there were child LiveRanges inside us, they will end up in
//   the returned DocumentFragment.
// - If the input DocumentFragment has LiveRanges, they will become
//   our children.
//
// It is illegal for newFrag to be empty.
LiveRange.prototype.replaceContents = function (newFrag) {
  if (! newFrag.firstChild)
    throw new Error("replaceContents requires non-empty fragment");

  return this.operate(function(oldStart, oldEnd) {
    // Insert new fragment
    oldStart.parentNode.insertBefore(newFrag, oldStart);

    // Pull out departing fragment
    // Possible optimization: use W3C Ranges on browsers that support them
    var retFrag = oldStart.ownerDocument.createDocumentFragment();
    var walk = oldStart;
    while (true) {
      var next = walk.nextSibling;
      retFrag.appendChild(walk);
      if (walk === oldEnd)
        break;
      walk = next;
      if (!walk)
        throw new Error("LiveRanges must begin and end on siblings in order");
    }

    return retFrag;
  });
};


// Perform a user-specified DOM mutation on the contents of this range.
//
// `func` is called with two parameters, `oldStart` and `oldEnd`, equal
// to the original firstNode() and lastNode() of this range.  `func` is allowed
// to perform arbitrary operations on the sequence of nodes from `oldStart`
// to `oldEnd` and on child ranges of this range.  `func` may NOT call methods
// on this range itself or otherwise rely on the existence of this range and
// enclosing ranges.  `func` must leave at least one node to become the new
// contents of this range.
//
// The return value of `func` is returned.
//
// This method is a generalization of replaceContents that works by
// temporarily removing this LiveRange from the DOM and restoring it after
// `func` has been called.
LiveRange.prototype.operate = function (func) {
  // boundary nodes of departing fragment
  var oldStart = this._start;
  var oldEnd = this._end;

  // pull off outer liverange data
  var outerStarts =
        this._removeEntries(oldStart, 0, 0, this._startIndex + 1);
  var outerEnds =
        this._removeEntries(oldEnd, 1, this._endIndex);

  var containerNode = oldStart.parentNode;
  var beforeNode = oldStart.previousSibling;
  var afterNode = oldEnd.nextSibling;

  var ret = null;

  // perform user-specifiedDOM manipulation
  ret = func(oldStart, oldEnd);

  // see what we've got...

  var newStart =
        beforeNode ? beforeNode.nextSibling : containerNode.firstChild;
  var newEnd =
        afterNode ? afterNode.previousSibling : containerNode.lastChild;

  if (! newStart || newStart === afterNode) {
    throw new Error("Ranges must contain at least one element");
  }

  // wrap endpoints if necessary
  var newEndpoints = wrapEndpoints(newStart, newEnd);
  newStart = this._ensureTag(newEndpoints[0]);
  newEnd = this._ensureTag(newEndpoints[1]);

  // put the outer liveranges back

  this._insertEntries(newStart, 0, 0, outerStarts);
  this._insertEntries(newEnd, 1, newEnd[this.tag][1].length, outerEnds);

  return ret;
};

// Move all liverange data represented in the DOM from sourceNode to
// targetNode.  targetNode must be capable of receiving liverange tags
// (for example, a node that has been the first or last node of a liverange
// before; not a text node in IE).
//
// This is a low-level operation suitable for moving liveranges en masse
// from one DOM tree to another, where transplantTag is called on every
// pair of nodes such that targetNode takes the place of sourceNode.
LiveRange.transplantTag = function(tag, targetNode, sourceNode) {

  if (! sourceNode[tag])
    return;

  // copy data pointer
  targetNode[tag] = sourceNode[tag];
  sourceNode[tag] = null;

  var starts = targetNode[tag][0];
  var ends = targetNode[tag][1];

  // fix _start and _end pointers
  for(var i=0;i<starts.length;i++)
    starts[i]._start = targetNode;
  for(var i=0;i<ends.length;i++)
    ends[i]._end = targetNode;
};

// Takes two sibling nodes tgtStart and tgtEnd with no LiveRange data on them
// and a LiveRange srcRange in a separate DOM tree.  Transplants srcRange
// to span from tgtStart to tgtEnd, and also copies info about enclosing ranges
// starting on srcRange._start or ending on srcRange._end.  tgtStart and tgtEnd
// must be capable of receiving liverange tags (for example, nodes that have
// held liverange data in the past; not text nodes in IE).
//
// This is a low-level operation suitable for moving liveranges en masse
// from one DOM tree to another.
LiveRange.transplantRange = function(tgtStart, tgtEnd, srcRange) {
  srcRange._ensureTag(tgtStart);
  if (tgtEnd !== tgtStart)
    srcRange._ensureTag(tgtEnd);

  srcRange._insertEntries(
    tgtStart, 0, 0,
    srcRange._start[srcRange.tag][0].slice(0, srcRange._startIndex + 1));
  srcRange._insertEntries(
    tgtEnd, 1, 0,
    srcRange._end[srcRange.tag][1].slice(srcRange._endIndex));
};

// Inserts a DocumentFragment immediately before this range.
// The new nodes are outside this range but inside all
// enclosing ranges.
LiveRange.prototype.insertBefore = function(frag) {
  var fragStart = frag.firstChild;

  if (! fragStart) // empty frag
    return;

  // insert into DOM
  this._start.parentNode.insertBefore(frag, this._start);

  // move starts of ranges that begin on this._start, but are
  // outside this, to beginning of fragStart
  this._ensureTag(fragStart);
  this._insertEntries(fragStart, 0, 0,
                       this._removeEntries(this._start, 0, 0,
                                            this._startIndex));
};

// Inserts a DocumentFragment immediately after this range.
// The new nodes are outside this range but inside all
// enclosing ranges.
LiveRange.prototype.insertAfter = function(frag) {
  var fragEnd = frag.lastChild;

  if (! fragEnd) // empty frag
    return;

  // insert into DOM
  this._end.parentNode.insertBefore(frag, this._end.nextSibling);

  // move ends of ranges that end on this._end, but are
  // outside this, to end of fragEnd
  this._ensureTag(fragEnd);
  this._insertEntries(fragEnd, 1, fragEnd[this.tag][1].length,
                       this._removeEntries(this._end, 1,
                                            this._endIndex + 1));
};

// Extracts this range and its contents from the DOM and
// puts it into a DocumentFragment, which is returned.
// All nodes and ranges outside this range are properly
// preserved.
//
// Because liveranges must contain at least one node,
// it is illegal to perform `extract` if the immediately
// enclosing range would become empty.  If this precondition
// is violated, no action is taken and null is returned.
LiveRange.prototype.extract = function() {
  if (this._startIndex > 0 &&
      this._start[this.tag][0][this._startIndex - 1]._end === this._end) {
    // immediately enclosing range wraps same nodes, so can't extract because
    // it would empty it.
    return null;
  }

  var before = this._start.previousSibling;
  var after = this._end.nextSibling;
  var parent = this._start.parentNode;

  if (this._startIndex > 0) {
    // must be a later node where outer ranges that start here end;
    // move their starts to after
    this._ensureTag(after);
    this._insertEntries(after, 0, 0,
                         this._removeEntries(this._start, 0, 0,
                                              this._startIndex));
  }

  if (this._endIndex < this._end[this.tag][1].length - 1) {
    // must be an earlier node where outer ranges that end here
    // start; move their ends to before
    this._ensureTag(before);
    this._insertEntries(before, 1, before[this.tag][1].length,
                         this._removeEntries(this._end, 1,
                                              this._endIndex + 1));
  }

  var result = document.createDocumentFragment();

  for(var n;
      n = before ? before.nextSibling : parent.firstChild,
      n && n !== after;)
    result.appendChild(n);

  return result;
};

// Find the immediately enclosing parent range of this range, or
// null if this range has no enclosing ranges.
//
// If `withSameContainer` is true, we stop looking when we reach
// this range's container node (the parent of its endpoints) and
// only return liveranges whose first and last nodes are siblings
// of this one's.
LiveRange.prototype.findParent = function(withSameContainer) {
  var result = enclosingRangeSearch(this.tag, this._end, this._endIndex);
  if (result)
    return result;

  if (withSameContainer)
    return null;

  return LiveRange.findRange(this.tag, this.containerNode());
};

// Find the nearest enclosing range containing `node`, if any.
LiveRange.findRange = function(tag, node) {
  var result = enclosingRangeSearch(tag, node);
  if (result)
    return result;

  if (! node.parentNode)
    return null;

  return LiveRange.findRange(tag, node.parentNode);
};

var enclosingRangeSearch = function(tag, end, endIndex) {
  // Search for an enclosing range, at the same level,
  // starting at node `end` or after the range whose
  // position in the end array of `end` is `endIndex`.
  // The search works by scanning forwards for range ends
  // while skipping over ranges whose starts we encounter.

  if (typeof endIndex === "undefined")
    endIndex = -1;

  if (end[tag] && endIndex + 1 < end[tag][1].length) {
    // immediately enclosing range ends at same node as this one
    return end[tag][1][endIndex + 1];
  }

  var node = end.nextSibling;
  while (node) {
    var endIndex = 0;
    var startData = node[tag] && node[tag][0];
    if (startData && startData.length) {
      // skip over sibling of this range
      var r = startData[0];
      node = r._end;
      endIndex = r._endIndex + 1;
    }
    if (node[tag] && endIndex < node[tag][1].length)
      return node[tag][1][endIndex];
    node = node.nextSibling;
  }

  return null;
};
