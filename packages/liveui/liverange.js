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
  // "tag" that contain this exact set of nodes, then: if inner is
  // false (the default), the new range will be outside all of them
  // (will contain all of them), or if inner is true, then it will be
  // inside all of them (be contained by all of them.)"
  //
  // It would be possible to add a fast path through this function
  // when caller can promise that there is no range that starts on
  // start that does not end by end, and vice versa. eg: when start
  // and end are the first and last child of their parent respectively
  // or when caller is building up the range tree from the inside
  // out. let's wait for the profiler to tell us to add this.
  Sky.ui._LiveRange = function (tag, start, end, inner) {
    if ((start instanceof Document) || (start instanceof DocumentFragment)) {
      end = start.lastChild;
      start = start.firstChild;
    }
    end = end || start;

    // XXX 'this.tag' is public for reading. document it.
    this.tag = tag;
    this._ensure_tags([start, end]);

    // Decide at what indices in start[tag][0] and end[tag][1] we
    // should insert the new range.
    //
    // If we are creating the range on the outside, we want to insert
    // it before the first range that starts at start and ends at
    // end. If are creating the range on the inside, we want to insert
    // it after the last range that starts at start and ends at end.
    //
    // If there are no other ranges that start at start and end at
    // end, then: if there are no ranges start on start AND no ranges
    // that end on end, then there is no choice to be made (the only
    // option is index 0.) Otherwise, we have to scan through the
    // siblings to figure out the correct nesting level.

    var start_first_match, end_last_match, match_count = 0;
    for (var i = 0; i < start[tag][0].length; i++)
      if (start[tag][0][i]._end === end) {
        start_first_match = i;

        do {
          match_count++;
          i++;
        } while (i < start[tag][0].length && start[tag][0][i]._end === end);

        for (i = end[tag][1].length - 1; i >= 0; i--) {
          if (end[tag][1][i]._start === start) {
            end_last_match = i;
            break;
          }
        }
        if (end_last_match === undefined)
          throw new Error("Corrupt range data");

        break;
      }

    var start_index, end_index;
    if (start[tag][0].length + end[tag][1].length === 0)
      start_index = end_index = 0;
    else if (start_first_match !== undefined) {
      if (inner) {
        start_index = start_first_match + match_count;
        end_index = end_last_match + 1 - match_count;
      } else {
        start_index = start_first_match;
        end_index = end_last_match + 1;
      }
    } else {
      // There are no other ranges that both start at start, and end
      // at end. To figure out where such a range should go, we need
      // to measure the difference in nesting level between the
      // two. We compute a value called 'balance' which is the nesting
      // depth of end, minus the nesting depth of start.

      // Examples ([] is existing ranges, {} is where the new range
      // should go):

      // [.. {[start] .. end}] => balance -1
      // [{start .. [end]} .. ] => balance 1

      // [.. {[start] .. [end]}] => balance -1
      // [{[start] .. [end]} .. ] => balance 1

      // [[.. {[start] .. end}]] => balance -2
      // [[{start .. [end]} .. ]] => balance 2

      // [[.. {[start] .. [end]}]] => balance -2
      // [[{[start] .. [end]} .. ]] => balance 2

      var balance = 0;
      var walk = start;
      while (true) {
        if (tag in walk)
          balance += walk[tag][0].length - walk[tag][1].length;
        if (walk === end)
          break;
        walk = walk.nextSibling;
      }

      // inner and outer modes will be the same since there are no
      // other ranges across exactly this part of elements.
      start_index = balance < 0 ? 0 : balance;
      end_index = (balance > 0 ? 0 : balance) + end[tag][1].length;
    }

    // this._start is the node N such that we begin before N, but not
    // before the node before N in the preorder traversal of the
    // document (if there is such a node.) this._start[this.tag][0]
    // will be the list of all LiveRanges for which this._start is N,
    // including us, sorted in the order that the ranges start. and
    // finally, this._start_idx is the value such that
    // this._start[this.tag][0][this._start_idx] === this.
    this._start = start;
    start[tag][0].splice(start_index, 0, this);
    for (i = start_index; i < start[tag][0].length; i++)
      start[tag][0][i]._start_idx = i;

    // just like this._end, except it's the node N such that we end
    // after N, but not after the node after N in the postorder
    // traversal; and the data is stored in this._end[this.tag][1], and
    // it's sorted in the order that the ranges end.
    this._end = end;
    end[tag][1].splice(end_index, 0, this);
    for (i = end_index; i < end[tag][1].length; i++)
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
  //
  // if you create or destroy ranges with this tag from a visitation
  // function, results are undefined!
  //
  // -- would be nice to let your visit function return false when
  // is_start is true to skip visiting that range/node's children..
  //
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
  // XXX remove
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

  // returns a DocumentFragment with the removed elements
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
})();