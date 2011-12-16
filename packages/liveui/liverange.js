Sky.ui = Sky.ui || {};

// XXX correct namespace? should probably be private to package, actually..

// Possible optimization: get rid of start_idx/end_idx and just search
// the list. Not clear which strategy will be faster.

// Possible extension: could allow zero-length ranges is some cases,
// by encoding both 'enter' and 'leave' type events in the same list

// can also pass just one node, or a document/documentfragment

// tag is an arbitrary string (the 'class' of range.) an expando
// attribute named 'tag' will be set on the endpoints of the range.
Sky.ui._LiveRange = function (tag, start, end) {
  if ((start instanceof Document) || (start instanceof DocumentFragment)) {
    end = start.lastChild;
    start = start.firstChild;
  }
  end = end || start;

  this._tag = tag;

  // this._start is the node N such that we begin before N, but not
  // before the node before N in the preorder traversal of the
  // document (if there is such a node.) this._start[this._tag][0]
  // will be the list of all LiveRanges for which this._start is N,
  // including us, sorted in the order that the ranges start. and
  // finally, this._start[this._start_idx] === this.
  this._start = start;
  if (!(tag in start))
    start[tag] = [[], []];
  this._start_idx = start[tag][0].length;
  start[tag][0].push(this);

  // just like this._end, except it's the node N such that we end
  // after N, but not after the node after N in the postorder
  // traversal; and the data is stored in this._end[this._tag][1], and
  // it's sorted in the order that the ranges end.
  this._end = end;
  if (!(tag in end))
    end[tag] = [[], []];
  this._end_idx = 0;
  end[tag][1].splice(0, 0, this);
};

// You shouldn't need to call this function for GC reasons on a modern
// browser. It's more like removeChild -- you'd call it because you
// don't want to see the range in contained() anymore. However, on old
// versions of IE, you do need to manually remove all ranges because
// IE can't GC reference cycles through the DOM.
Sky.ui._LiveRange.prototype.destroy = function () {
  var start_data = this._start[this._tag];
  start_data[0].splice(this._start_idx, 1);
  if (start_data[0].length === 0 && start_data[1].length === 0)
    delete this._start[this._tag];

  var end_data = this._end[this._tag];
  end_data[1].splice(this._end_idx, 1);
  if (end_data[0].length === 0 && end_data[1].length === 0)
    delete this._end[this._tag];

  this._start = this._end = null;
};

// (returns only ranges with the same tag as this one)
Sky.ui._LiveRange.prototype.contained = function () {
  // visit() is invoked for each node start-point or end-point that we
  // encounter as we walk the range stored in 'this' (not counting the
  // endpoints of 'this' itself.)
  var result = {children: []};
  var stack = [result];
  var visit = function (is_start, range) {
    if (is_start) {
      var record = {range: range, children: []};
      stack[stack.length - 1].children.push(record);
      stack.push(record);
    } else
      if (stack.pop().range !== range)
        throw new Error("Overlapping ranges detected");
  };

  var traverse = function (node) {
    var data = node[this._tag] || [[], []];
    for (var i = 0; i < data[0].length; i++)
      visit(true, data[0][i]);
    for (var walk = node.firstChild; walk; walk = walk.nextSibling)
      traverse(walk);
    for (var i = 0; i < data[1].length; i++)
      visit(false, data[1][i]);
  };

  var start_enter = this._start[this._tag][0];
  for (var i = this._start_idx + 1; i < start_enter.length; i++)
    visit(true, start_enter[i]);

  var walk = this._start;
  while (true) {
    traverse(walk);
    if (walk === this._end)
      break;
    walk = walk.nextSibling;
  }

  var end_leave = this._end[this._tag][1];
  for (var i = 0; i < this._end_idx; i++)
    visit(false, end_leave[i]);

  return result.children;
};

Sky.ui._LiveRange.prototype.replace_contents = function (new_frag) {
  if (!new_frag.firstChild)
    throw new Error("Ranges must contain at least one element");

  // Fix up range pointers on departing fragment
  var old_enter = this._start[this._tag][0];
  var save_enter = old_enter.splice(0, this._start_idx + 1);
  for (var i = 0; i < old_enter.length; i++)
    old_enter[i]._start_idx = i;

  var old_leave = this._end[this._tag][1]
  var save_leave = old_leave.splice(this._end_idx, old_leave.length);

  // Insert new fragment
  var new_start = new_frag.firstChild;
  var new_end = new_frag.lastChild;
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
  var new_enter = new_start[this._tag][0];
  Array.prototype.splice.apply(new_enter, [0, 0].concat(save_enter));
  for (var i = 0; i < new_enter.length; i++) {
    new_enter[i]._start = new_start;
    new_enter[i]._start_idx = i;
  }

  var new_leave = new_end[this._tag][1];
  for (var i = 0; i < save_leave.length; i++) {
    save_leave[i]._end = new_end;
    save_leave[i]._end_idx = new_leave.length + i;
  }
  Array.prototype.push.apply(new_leave, save_leave);

  return ret;
};
