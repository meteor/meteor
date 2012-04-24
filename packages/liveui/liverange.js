// Stand back, I'm going to try SCIENCE.

Meteor.ui = Meteor.ui || {};

(function () {
  // XXX we should eventually move LiveRange off into its own
  // package. but it would be also be nice to keep it as a single,
  // self-contained file to make it easier to use outside of Meteor.

  // Possible optimization: get rid of start_idx/end_idx and just search
  // the list. Not clear which strategy will be faster.

  // Possible extension: could allow zero-length ranges is some cases,
  // by encoding both 'enter' and 'leave' type events in the same list

  var canSetTextProps = (function() {
    // IE8 and earlier don't support expando attributes on text nodes,
    // but fortunately they are allowed on comments.
    var test_elt = document.createTextNode("");
    var exception;
    try {
      test_elt.test = 123;
    } catch (exception) { }

    return (test_elt.test === 123);
  })();

  Meteor.ui._wrap_endpoints = function (start, end) {
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


  // This is a constructor (invoke it as 'new Meteor.ui._LiveRange').
  //
  // Create a range, tagged 'tag', that includes start, end, and all
  // the nodes between them, and the children of all of those nodes,
  // but includes no other nodes. If there are other ranges tagged
  // 'tag' that contain this exact set of nodes, then: if inner is
  // false (the default), the new range will be outside all of them
  // (will contain all of them), or if inner is true, then it will be
  // inside all of them (be contained by all of them.) If there are no
  // other ranges that contain this exact set of nodes, then 'inner'
  // is ignored because the nesting of the new range with respect to
  // other ranges is uniquely determined.
  //
  // To track the range as it's relocated, some of the DOM nodes that
  // are part of the range will have an expando attribute set on
  // them. The name of the expando attribute will be 'tag', so pick
  // something that won't collide.
  //
  // Instead of start and end, you can pass a document or
  // documentfragment for start and leave end undefined. Or you can
  // pass a node for start and leave end undefined, in which case end
  // === start.
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
  Meteor.ui._LiveRange = function (tag, start, end, inner) {
    if (start.nodeType === 11 /* DocumentFragment */) {
      end = start.lastChild;
      start = start.firstChild;
    }
    end = end || start;

    this.tag = tag; // must be set before calling _ensure_tag

    var endpoints = Meteor.ui._wrap_endpoints(start, end);
    start = this._ensure_tag(endpoints[0]);
    end = this._ensure_tag(endpoints[1]);

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

    var start_index = findPosition(start[tag][0], true, end, start, inner);
    var end_index = findPosition(end[tag][1], false, start, end, inner);

    // this._start is the node N such that we begin before N, but not
    // before the node before N in the preorder traversal of the
    // document (if there is such a node.) this._start[this.tag][0]
    // will be the list of all LiveRanges for which this._start is N,
    // including us, sorted in the order that the ranges start. and
    // finally, this._start_idx is the value such that
    // this._start[this.tag][0][this._start_idx] === this.
    //
    // Similarly for this._end, except it's the node N such that we end
    // after N, but not after the node after N in the postorder
    // traversal; and the data is stored in this._end[this.tag][1], and
    // it's sorted in the order that the ranges end.

    // Set this._start, this._end, this._start_idx, this._end_idx
    this._insert_entries(start, 0, start_index, [this]);
    this._insert_entries(end, 1, end_index, [this]);
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
    var initial_n = (findEndNotStart ? edge.parentNode.lastChild : otherEdge);
    var take_first = (findEndNotStart ? ! inner : inner);
    for(var i=0, n=initial_n; i<=ranges.length; i++) {
      var r = ranges[i];
      var curEdge = r && (findEndNotStart ? r._end : r._start);
      while (n !== curEdge && n !== edge) {
        n = n.previousSibling;
      }
      if (curEdge === edge) {
        index = i;
        if (take_first) break;
      } else if (n === edge) {
        index = i;
        break;
      }
    }
    return index;
  };

  Meteor.ui._LiveRange.prototype._ensure_tag = function (node) {
    if (!(this.tag in node))
      node[this.tag] = [[], []];
    return node;
  };

  var can_delete_expandos = (function() {
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

  Meteor.ui._LiveRange._clean_node = function (tag, node, force) {
    var data = node[tag];
    if (data && (!(data[0].length + data[1].length) || force)) {
      if (can_delete_expandos)
        delete node[tag];
      else
        node.removeAttribute(tag);
    }
  };

  // Delete a LiveRange. This is analogous to removing a DOM node from
  // its parent -- it will no longer appear when traversing the tree
  // with visit().
  //
  // On modern browsers there is no requirement to delete
  // LiveRanges. They will be garbage collected just like any other
  // object. However, on old versions of IE, you probably do need to
  // manually remove all ranges because IE can't GC reference cycles
  // through the DOM.
  Meteor.ui._LiveRange.prototype.destroy = function (recursive) {
    if (recursive) {
      this.visit(function(is_start, range) {
        if (is_start) {
          range.finalize();
          range._start = null;
          range._end = null;
        }
      }, function(is_start, node) {
        if (! is_start) {
          // when leaving a node, clean its children
          for(var n = node.firstChild; n; n = n.nextSibling) {
            Meteor.ui._LiveRange._clean_node(this.tag, n, true);
          }
        }
      });

      this._remove_entries(this._start, 0, this._start_idx);
      this._remove_entries(this._end, 1, 0, this._end_idx + 1);
      // force-clean the top-level nodes in this, besides _start and _end
      if (this._start !== this._end) {
        for(var n = this._start.nextSibling;
            n !== this._end;
            n = n.nextSibling) {
          Meteor.ui._LiveRange._clean_node(this.tag, n, true);
        }
      }

      this._start = this._end = null;

    } else {
      this._remove_entries(this._start, 0, this._start_idx, this._start_idx + 1);
      this._remove_entries(this._end, 1, this._end_idx, this._end_idx + 1);
      this._start = this._end = null;
    }
  };

  // Return the first node in the range (in preorder traversal)
  Meteor.ui._LiveRange.prototype.firstNode = function () {
    return this._start;
  };

  // Return the last node in the range (in postorder traversal)
  Meteor.ui._LiveRange.prototype.lastNode = function () {
    return this._end;
  };

  // Return the node that immediately contains this LiveRange, that is,
  // the parentNode of firstNode and lastNode.
  Meteor.ui._LiveRange.prototype.containerNode = function() {
    return this._start.parentNode;
  };

  // Walk through the current contents of a LiveRange, enumerating
  // either the contained ranges (with the same tag as this range),
  // the contained elements, or both.
  //
  // visit_range(is_start, range) is invoked for each range
  // start-point or end-point that we encounter as we walk the range
  // stored in 'this' (not counting the endpoints of 'this' itself.)
  // visit_node(is_start, node) is similar but for nodes.  Both
  // functions are optional.
  //
  // If you return false (i.e. a value === false) from visit_range
  // or visit_node when is_start is true, the children of that range
  // or node are skipped, and the next callback will be the same
  // range or node with is_start false.
  //
  // If you create or destroy ranges with this tag from a visitation
  // function, results are undefined!
  Meteor.ui._LiveRange.prototype.visit = function(visit_range, visit_node) {
    visit_range = visit_range || function() {};
    visit_node = visit_node || function() {};

    var tag = this.tag;

    var recurse = function(start, end, start_range_skip) {
      var startIndex = start_range_skip || 0;
      var after = end.nextSibling;
      for(var n = start; n && n !== after; n = n.nextSibling) {
        var startData = tag && n[tag] && n[tag][0];
        if (startData && startIndex < startData.length) {
          // immediate child range that starts with n
          var range = startData[startIndex];
          // copy _start and _end in case they change inside
          // the callback (hard to support in the general case,
          // but useful in destroy(true) for example)
          var range_start = range._start;
          var range_end = range._end;
          if (visit_range(true, range) !== false)
            recurse(range_start, range_end, startIndex+1);
          visit_range(false, range);
          n = range_end;
        }
        else {
          // bare node
          if (visit_node(true, n) !== false && n.firstChild)
            recurse(n.firstChild, n.lastChild);
          visit_node(false, n);
        }
        startIndex = 0;
      }
    };

    recurse(this._start, this._end, this._start_idx + 1);
  };

  // startEnd === 0 for starts, 1 for ends
  Meteor.ui._LiveRange.prototype._remove_entries =
    function(node, startEnd, i, j)
  {
    var entries = node[this.tag][startEnd];
    i = i || 0;
    j = (j || j === 0) ? j : entries.length;
    var removed = entries.splice(i, j-i);
    // fix up remaining ranges (not removed ones)
    for(var a = i; a < entries.length; a++) {
      if (startEnd) entries[a]._end_idx = a;
      else entries[a]._start_idx = a;
    }

    // potentially remove empty liverange data
    if (! entries.length) {
      Meteor.ui._LiveRange._clean_node(this.tag, node);
    }

    return removed;
  };

  Meteor.ui._LiveRange.prototype._insert_entries =
    function(node, startEnd, i, newRanges)
  {
    // insert the new ranges and "adopt" them by setting node pointers
    var entries = node[this.tag][startEnd];
    Array.prototype.splice.apply(entries, [i, 0].concat(newRanges));
    for(var a=i; a < entries.length; a++) {
      if (startEnd) {
        entries[a]._end = node;
        entries[a]._end_idx = a;
      } else {
        entries[a]._start = node;
        entries[a]._start_idx = a;
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
  // new_frag must not be empty!
  //
  // Or, the caller can pass a function to perform the replacement in terms
  // of DOM operations.  Before the function is called, the nodes in this range
  // are stripped of data about this range and ranges external to it.  This
  // information is restored afterwards.  Passing a fragment is equivalent to
  // passing a function that removes the nodes in this range and inserts
  // the contents of the fragment.  This liverange and enclosing liveranges
  // that have been temporarily removed while calling the function are not
  // fully functional while the function executes.  They have start and end
  // nodes, but those nodes do not have pointers back to them.
  Meteor.ui._LiveRange.prototype.replace_contents =
    function (new_frag_or_func)
  {
    // boundary nodes of departing fragment
    var old_start = this._start;
    var old_end = this._end;

    // pull off outer liverange data
    var outer_starts =
          this._remove_entries(old_start, 0, 0, this._start_idx + 1);
    var outer_ends =
          this._remove_entries(old_end, 1, this._end_idx);

    var container_node = old_start.parentNode;
    var before_node = old_start.previousSibling;
    var after_node = old_end.nextSibling;

    var ret = null;

    ////////// actual replacement (DOM manipulation) happens here

    if (typeof new_frag_or_func === "function") {

      ret = new_frag_or_func(old_start, old_end);

    } else {

      var new_frag = new_frag_or_func;

      if (! new_frag.firstChild)
        throw new Error("replace_contents requires non-empty fragment");

      // Insert new fragment
      old_start.parentNode.insertBefore(new_frag, old_start);

      // Pull out departing fragment
      // Possible optimization: use W3C Ranges on browsers that support them
      ret = old_start.ownerDocument.createDocumentFragment();
      var walk = old_start;
      while (true) {
        var next = walk.nextSibling;
        ret.appendChild(walk);
        if (walk === old_end)
          break;
        walk = next;
        if (!walk)
          throw new Error("LiveRanges must begin and end on siblings in order");
      }

    }

    //////////

    var new_start =
          before_node ? before_node.nextSibling : container_node.firstChild;
    var new_end =
          after_node ? after_node.previousSibling : container_node.lastChild;

    if (! new_start || new_start === after_node) {
      throw new Error("Ranges must contain at least one element");
    }

    // Wrap endpoints if necessary
    var new_endpoints = Meteor.ui._wrap_endpoints(new_start, new_end);
    new_start = this._ensure_tag(new_endpoints[0]);
    new_end = this._ensure_tag(new_endpoints[1]);

    // put the outer liveranges back

    this._insert_entries(new_start, 0, 0, outer_starts);
    this._insert_entries(new_end, 1, new_end[this.tag][1].length, outer_ends);

    return ret;
  };

  Meteor.ui._LiveRange.prototype.transplant_tag =
    function(targetNode, sourceNode)
  {
    if (! sourceNode[this.tag])
      return;

    // copy data pointer (don't bother to clean sourceNode)
    targetNode[this.tag] = sourceNode[this.tag];

    var starts = targetNode[this.tag][0];
    var ends = targetNode[this.tag][1];

    // fix _start and _end pointers
    for(var i=0;i<starts.length;i++)
      starts[i]._start = targetNode;
    for(var i=0;i<ends.length;i++)
      ends[i]._end = targetNode;
  };


  Meteor.ui._LiveRange.prototype.insert_before = function(frag) {
    var frag_start = frag.firstChild;

    if (! frag_start) // empty frag
      return;

    // insert into DOM
    this._start.parentNode.insertBefore(frag, this._start);

    // move starts of ranges that begin on this._start, but are
    // outside this, to beginning of frag_start
    this._ensure_tag(frag_start);
    this._insert_entries(frag_start, 0, 0,
                         this._remove_entries(this._start, 0, 0,
                                              this._start_idx));
  };

  Meteor.ui._LiveRange.prototype.insert_after = function(frag) {
    var frag_end = frag.lastChild;

    if (! frag_end) // empty frag
      return;

    // insert into DOM
    this._end.parentNode.insertBefore(frag, this._end.nextSibling);

    // move ends of ranges that end on this._end, but are
    // outside this, to end of frag_end
    this._ensure_tag(frag_end);
    this._insert_entries(frag_end, 1, frag_end[this.tag][1].length,
                         this._remove_entries(this._end, 1,
                                              this._end_idx + 1));
  };

  Meteor.ui._LiveRange.prototype.extract = function() {
    if (this._start_idx > 0 &&
        this._start[this.tag][0][this._start_idx - 1]._end === this._end) {
      // immediately enclosing range wraps same nodes, so can't extract because
      // it would empty it.
      return null;
    }

    var before = this._start.previousSibling;
    var after = this._end.nextSibling;
    var parent = this._start.parentNode;

    if (this._start_idx > 0) {
      // must be a later node where outer ranges that start here end;
      // move their starts to after
      this._ensure_tag(after);
      this._insert_entries(after, 0, 0,
                           this._remove_entries(this._start, 0, 0,
                                                this._start_idx));
    }

    if (this._end_idx < this._end[this.tag][1].length - 1) {
      // must be an earlier node where outer ranges that end here
      // start; move their ends to before
      this._ensure_tag(before);
      this._insert_entries(before, 1, before[this.tag][1].length,
                           this._remove_entries(this._end, 1,
                                                this._end_idx + 1));
    }

    var result = document.createDocumentFragment();

    for(var n;
        n = before ? before.nextSibling : parent.firstChild,
        n && n !== after;)
      result.appendChild(n);

    return result;
  };

})();
