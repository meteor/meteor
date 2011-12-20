// Stand back, I'm going to try SCIENCE.

Sky.ui = Sky.ui || {};

// XXX maybe take out of funtion(){}() -- unnecessary at the moment
(function () {
  // XXX correct namespace? should probably be private to package, actually..

  // Possible optimization: get rid of start_idx/end_idx and just search
  // the list. Not clear which strategy will be faster.

  // Possible extension: could allow zero-length ranges is some cases,
  // by encoding both 'enter' and 'leave' type events in the same list



  // can also pass just one node, or a document/documentfragment

  // tag is an arbitrary string (the 'class' of range.) an expando
  // attribute named 'tag' will be set on the endpoints of the range.

  // 'start' - start point, in preorder traversal (range starts just before start)
  // 'end' - end point, in postorder traversal (range ends just after end)
  // if there are any other ranges that also span exactly from start
  // to end, the new range will be outside of them.
  //
  // "Create a range, tagged 'tag', that includes start, end, and all
  // the nodes between them, and the children of all of those nodes,
  // but includes no other nodes. If there are other ranges tagged
  // "tag" that contain this exact set of nodes, then the new range
  // will contain them."
  //
  // if fast is set, you are promising that there is no range that
  // starts on start that does not end by end, and vice versa. this is
  // trivially true in the common case that start and end are the
  // first and last child of their parent respectively (in this case,
  // fast will be automatically set to true for you), or in the case
  // that you are building up the range tree from the inside out. if
  // fast is set, then the function is bounded by O(ranges that start
  // on start + ranges that end on end). if fast is false, then add
  // O(siblings between start and and) to that running time.
  Sky.ui._LiveRange = function (tag, start, end, fast) {
    if ((start instanceof Document) || (start instanceof DocumentFragment)) {
      end = start.lastChild;
      start = start.firstChild;
    }
    end = end || start;

    // XXX 'this.tag' is public for reading. document it.
    this.tag = tag;
    this._ensure_tags([start, end]);

    var balance = 0;
    fast = fast ||
      (start.parentNode.firstChild === start &&
       end.parentNode.lastChild === end);
    if (!fast) {
      var walk = start;
      while (true) {
        if (tag in walk)
          balance += walk[tag][0].length - walk[tag][1].length;
        if (walk === end)
          break;
        walk = walk.nextSibling;
      }
    }

    // Examples ([] is existing ranges, {} is new range)

    // [.. {[start] .. end}] => balance -1
    // [{start .. [end]} .. ] => balance 1

    // [.. {[start] .. [end]}] => balance -1
    // [{[start] .. [end]} .. ] => balance 1

    // [[.. {[start] .. end}]] => balance -2
    // [[{start .. [end]} .. ]] => balance 2

    // [[.. {[start] .. [end]}]] => balance -2
    // [[{[start] .. [end]} .. ]] => balance 2

    // this._start is the node N such that we begin before N, but not
    // before the node before N in the preorder traversal of the
    // document (if there is such a node.) this._start[this.tag][0]
    // will be the list of all LiveRanges for which this._start is N,
    // including us, sorted in the order that the ranges start. and
    // finally, this._start[this._start_idx] === this.
    this._start = start;
    var i = balance < 0 ? 0 : balance;
    start[tag][0].splice(i, 0, this);
    for (; i < start[tag][0].length; i++)
      start[tag][0][i]._start_idx = i;

    // just like this._end, except it's the node N such that we end
    // after N, but not after the node after N in the postorder
    // traversal; and the data is stored in this._end[this.tag][1], and
    // it's sorted in the order that the ranges end.
    this._end = end;
    i = (balance > 0 ? 0 : balance) + end[tag][1].length;
    end[tag][1].splice(i, 0, this);
    for (; i < end[tag][1].length; i++)
      end[tag][1][i]._end_idx = i;
  };

  Sky.ui._LiveRange.prototype._ensure_tags = function (nodes) {
    for (var i = 0; i < nodes.length; i++)
      if (!(this.tag in nodes[i]))
        nodes[i][this.tag] = [[], []];
  };

  Sky.ui._LiveRange.prototype._clean_tags = function (nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var data = nodes[i][this.tag];
      if (data && !(data[0].length + data[1].length))
        delete nodes[i][this.tag];
    }
  };

  // You shouldn't need to call this function for GC reasons on a modern
  // browser. It's more like removeChild -- you'd call it because you
  // don't want to see the range in contained() anymore. However, on old
  // versions of IE, you do need to manually remove all ranges because
  // IE can't GC reference cycles through the DOM.
  Sky.ui._LiveRange.prototype.destroy = function () {
    var enter = this._start[this.tag][0];
    enter.splice(this._start_idx, 1);
    for (var i = this._start_idx; i < enter.length; i++)
      enter[i]._start_idx = i;

    var leave = this._end[this.tag][1];
    leave.splice(this._end_idx, 1);
    for (var i = this._end_idx; i < leave.length; i++)
      leave[i]._end_idx = i;

    this._clean_tags([this._start, this._end]);
    this._start = this._end = null;
  };

  // The first node in the range (in preorder traversal)
  Sky.ui._LiveRange.prototype.firstNode = function () {
    return this._start;
  };

  // The last node in the range (in postorder traversal)
  Sky.ui._LiveRange.prototype.lastNode = function () {
    return this._end;
  };

  // visit_range(is_start, range) is invoked for each range
  // start-point or end-point that we encounter as we walk the range
  // stored in 'this' (not counting the endpoints of 'this' itself.)
  // visit_node(is_start, node) is similar but for nodes, and is
  // optional.
  // -- would be nice to let your visit function return false when
  // is_start is true to skip visiting that range/node's children..
  Sky.ui._LiveRange.prototype.visit = function (visit_range, visit_node) {
    var traverse = function (node, data, start_bound, end_bound, tag) {
      for (var i = start_bound; i < data[0].length; i++)
        visit_range(true, data[0][i]);
      visit_node && visit_node(true, node);
      for (var walk = node.firstChild; walk; walk = walk.nextSibling) {
        var walk_data = walk[tag] || [[], []];
        traverse(walk, walk_data, 0, walk_data[1].length, tag);
      }
      visit_node && visit_node(false, node);
      for (var i = 0; i < end_bound; i++)
        visit_range(false, data[1][i]);
    };

    var walk = this._start;
    while (true) {
      var walk_data = walk[this.tag] || [[], []];
      traverse(walk, walk_data, walk === this._start ? this._start_idx + 1 : 0,
               walk === this._end ? this._end_idx : walk_data[1].length,
               this.tag);
      if (walk === this._end)
        break;
      walk = walk.nextSibling;
    }
  };

  // (returns only ranges with the same tag as this one)
  // XXX could remove .. or just provide a verify() method in debug mode..
  Sky.ui._LiveRange.prototype.contained = function () {
    var result = {range: this, children: []};
    var stack = [result];

    this.visit(function (is_start, range) {
      if (is_start) {
        var record = {range: range, children: []};
        stack[stack.length - 1].children.push(record);
        stack.push(record);
      } else
        if (stack.pop().range !== range)
          throw new Error("Overlapping ranges detected");
    });

    return result;
  };

  // XXX need to make sure that tags are removed if they become empty
  Sky.ui._LiveRange.prototype.replace_contents = function (new_frag) {
    if (!new_frag.firstChild)
      throw new Error("Ranges must contain at least one element");

    // Fix up range pointers on departing fragment
    var old_enter = this._start[this.tag][0];
    var save_enter = old_enter.splice(0, this._start_idx + 1);
    for (var i = 0; i < old_enter.length; i++)
      old_enter[i]._start_idx = i;

    var old_leave = this._end[this.tag][1]
    var save_leave = old_leave.splice(this._end_idx, old_leave.length);

    this._clean_tags([this._start, this._end]);

    // Insert new fragment
    var new_start = new_frag.firstChild;
    var new_end = new_frag.lastChild;
    this._ensure_tags([new_start, new_end]);
    this._start.parentNode.insertBefore(new_frag, this._start);

    // Pull out departing fragment
    // Possible optimization: use W3C Ranges on browsers that support them
    var ret = this._start.ownerDocument.createDocumentFragment();
    var walk = this._start;
    while (true) {
      var next = walk.nextSibling;
      ret.appendChild(walk);
      if (walk === this._end)
        break;
      walk = next;
    }

    // Fix up range pointers on new fragment -- including our own
    // Clobbers this._start(_idx), this._end(_idx)
    var new_enter = new_start[this.tag][0];
    Array.prototype.splice.apply(new_enter, [0, 0].concat(save_enter));
    for (var i = 0; i < new_enter.length; i++) {
      new_enter[i]._start = new_start;
      new_enter[i]._start_idx = i;
    }

    var new_leave = new_end[this.tag][1];
    for (var i = 0; i < save_leave.length; i++) {
      save_leave[i]._end = new_end;
      save_leave[i]._end_idx = new_leave.length + i;
    }
    Array.prototype.push.apply(new_leave, save_leave);

    return ret;
  };

  // Remove the range from inside its current parent, and return a
  // fragment that contains exactly the range's contents (including any
  // subranges.) Throw an exception if this would make a parent range
  // empty.
  Sky.ui._LiveRange.prototype.extract = function () {
    throw new Error("Unimplemented");
    // XXX IMPLEMENT

    // A range is abutting on the left if there are no elements between
    // its start and the end of the previous sibling range, or if there
    // are no siblings, the beginning of its immediate containing range,
    // or if there is no containing range, the beginning of the
    // document. "Abutting on the right" has a similar definition.

    // We throw an exception if we're both abutting on both the left and
    // the right.

    // We're abutting on the left if this._start_idx > 0. We're abutting
    // on the right if this._end_idx !== this._end[this.tag][1].length - 1.
    // XXX is this complete, eg maybe need to look at eg this._end.

    // ---

    // As usual we need to repair just the start and the end of the range
    //
    // What's happening to the departing range is clear.
    //
    // On the start side, there are the start contexts that occur before
    // this._start_idx. They need to be relocated.

  };

  // Insert frag so that it comes immediately before the start of the
  // range.
  Sky.ui._LiveRange.prototype.insertBefore = function (frag) {
    throw new Error("Unimplemented");
    // XXX IMPLEMENT
  };

  // Insert frag so that it comes immediately after the start of the
  // range.
  Sky.ui._LiveRange.prototype.insertAfter = function (frag) {
    throw new Error("Unimplemented");
    // XXX IMPLEMENT
  };

})();